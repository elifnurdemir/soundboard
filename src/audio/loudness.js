// Algılanan ses yüksekliği (ITU-R BS.1770-4, LUFS) ve eşitleme kazancı.
// Tepe değerine (peak) bakmak yetmez: kısa bir patlama sesi tepede ama kulağa sessiz gelir.
// LUFS insan kulağına göre ağırlıklı ortalama verir; Spotify/YouTube da bununla eşitler.

// K-ağırlıklama filtresi (BS.1770). Katsayılar her örnekleme hızı için yeniden hesaplanır;
// formül libebur128'deki ile aynı ve 48 kHz'de standardın tablosundaki katsayıları verir.
function shelfCoeffs(fs) {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  return {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
}

function highpassCoeffs(fs) {
  const f0 = 38.13547087602444, Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / fs);
  const a0 = 1 + K / Q + K * K;
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
}

// İki filtreyi art arda uygular, her örneğin karesini döner (bellekte tek dizi)
function weightedSquares(x, sh, hp) {
  const out = new Float32Array(x.length);
  let s1 = 0, s2 = 0, h1 = 0, h2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = sh.b0 * v + s1;
    s1 = sh.b1 * v - sh.a1 * y + s2;
    s2 = sh.b2 * v - sh.a2 * y;
    const z = hp.b0 * y + h1;
    h1 = hp.b1 * y - hp.a1 * z + h2;
    h2 = hp.b2 * y - hp.a2 * z;
    out[i] = z * z;
  }
  return out;
}

const blockLoudness = (ms) => -0.691 + 10 * Math.log10(ms);

/**
 * channels: Float32Array[] (AudioBuffer.getChannelData), sampleRate: Hz.
 * Dönen: { lufs, peak } — lufs: tümleşik yükseklik (sessizse -Infinity), peak: 0..1+ örnek tepe değeri.
 */
export function measureLoudness(channels, sampleRate) {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }

  const sh = shelfCoeffs(sampleRate);
  const hp = highpassCoeffs(sampleRate);
  const squares = channels.slice(0, 2).map((ch) => weightedSquares(ch, sh, hp));
  // Tek kanallı ses iki hoparlöre birden gider; stereo bir sesle aynı ölçekte olsun diye iki kanal sayılır
  const weight = channels.length === 1 ? 2 : 1;
  const len = channels[0]?.length || 0;

  // 400 ms bloklar, %75 örtüşme. Ses 400 ms'den kısaysa tek blok olarak ölçülür
  const blockLen = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  const blocks = [];
  const sumRange = (from, to) => {
    let total = 0;
    for (const sq of squares) { let s = 0; for (let i = from; i < to; i++) s += sq[i]; total += s / (to - from); }
    return total * weight;
  };
  if (len === 0) return { lufs: -Infinity, peak };
  if (len < blockLen) blocks.push(sumRange(0, len));
  else for (let start = 0; start + blockLen <= len; start += step) blocks.push(sumRange(start, start + blockLen));

  // Mutlak kapı (-70 LUFS) ve göreli kapı (ortalamanın 10 LU altı): sessiz kısımlar ortalamayı düşürmesin
  const abs = blocks.filter((ms) => blockLoudness(ms) > -70);
  if (!abs.length) return { lufs: -Infinity, peak };
  const relGate = blockLoudness(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((ms) => blockLoudness(ms) > relGate);
  return { lufs: blockLoudness(gated.reduce((a, b) => a + b, 0) / gated.length), peak };
}

export const LOUDNESS_TARGETS = [
  { id: 'quiet', label: 'Sakin', lufs: -20 },
  { id: 'normal', label: 'Normal', lufs: -16 },
  { id: 'loud', label: 'Yüksek', lufs: -12 },
];

const MAX_BOOST_DB = 12;   // çok sessiz bir kaydı sonsuza kadar yükseltmesin (gürültüsü de yükselir)
const PEAK_CEILING = 0.95; // eşitledikten sonra tepe bunu geçmesin: kesilme/patlama olmaz

/**
 * Hedef yüksekliğe ulaşmak için çarpılacak kazanç. Ölçüm yoksa ya da ses sessizse 1.
 * Yükseltme hem 12 dB ile hem de tepe tavanıyla sınırlıdır; kısma sınırsızdır.
 */
export function normalizationGain(loudness, targetLufs) {
  if (!loudness || !Number.isFinite(loudness.lufs)) return 1;
  let gain = 10 ** ((targetLufs - loudness.lufs) / 20);
  gain = Math.min(gain, 10 ** (MAX_BOOST_DB / 20));
  if (gain > 1 && loudness.peak > 0) gain = Math.min(gain, Math.max(1, PEAK_CEILING / loudness.peak));
  return gain;
}

export function targetLufsFor(id) {
  return (LOUDNESS_TARGETS.find((t) => t.id === id) || LOUDNESS_TARGETS[1]).lufs;
}

// Yalnızca test için
export const _coeffs = (fs) => ({ sh: shelfCoeffs(fs), hp: highpassCoeffs(fs) });
