const MP3_KBPS = 128;
const BLOCK = 1152; // MP3 frame size
const YIELD_EVERY = 200; // blocks — UI donmasın

function toInt16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const v = Math.max(-1, Math.min(1, float32[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

/**
 * Bir AudioBuffer'ı MP3'e kodlar. Döner: ArrayBuffer (mp3 baytları).
 * Kodlayıcı büyük olduğu için sadece gerektiğinde yüklenir.
 */
export async function encodeAudioBufferToMp3(buffer, onProgress, kbps = MP3_KBPS) {
  const { Mp3Encoder } = await import('@breezystack/lamejs');

  const channels = Math.min(2, buffer.numberOfChannels);
  const left = toInt16(buffer.getChannelData(0));
  const right = channels > 1 ? toInt16(buffer.getChannelData(1)) : null;
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, kbps);

  const chunks = [];
  let size = 0;
  const push = (c) => { if (c.length) { chunks.push(c); size += c.length; } };

  for (let i = 0, n = 0; i < left.length; i += BLOCK, n++) {
    const l = left.subarray(i, i + BLOCK);
    push(right ? encoder.encodeBuffer(l, right.subarray(i, i + BLOCK)) : encoder.encodeBuffer(l));
    if (n % YIELD_EVERY === 0) {
      onProgress?.(i / left.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  push(encoder.flush());

  const out = new Uint8Array(size);
  let off = 0;
  chunks.forEach((c) => { out.set(c, off); off += c.length; });
  return out.buffer;
}

/**
 * Sesi gain kadar yükseltir (Audacity'deki Amplify gibi, dosyaya işlenir). Çıkışta bir sınırlayıcı (limiter) vardır:
 * yükselen tepeler sert kesilip cızırdamaz, yumuşakça kısılır.
 */
export async function amplifyBuffer(buffer, gain) {
  const off = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  const g = off.createGain();
  g.gain.value = gain;
  const lim = off.createDynamicsCompressor();
  lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
  src.connect(g); g.connect(lim); lim.connect(off.destination);
  src.start();
  return off.startRendering();
}

/** Tam dosyayı yükseltip MP3 yapar (kırpma yok). */
export async function amplifyToMp3(url, gain, onProgress) {
  const res = await fetch(url);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let buffer;
  try {
    buffer = await amplifyBuffer(await ctx.decodeAudioData(await res.arrayBuffer()), gain);
  } finally {
    ctx.close().catch(() => {});
  }
  return encodeAudioBufferToMp3(buffer, onProgress);
}

/**
 * Bir ses dosyasının [start, end) saniyelik kısmını kesip MP3 yapar (end null: sona kadar).
 * Kırpılan kısım gerçekten dosyaya yazılır; kalan kısım atılır.
 */
export async function trimToMp3(url, start, end, onProgress, gain = 1) {
  const res = await fetch(url);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    const rate = buffer.sampleRate;
    const from = Math.max(0, Math.floor((start || 0) * rate));
    const to = Math.min(buffer.length, end == null ? buffer.length : Math.floor(end * rate));
    if (to - from < rate * 0.05) throw new Error('Kırpılan bölüm çok kısa');
    const cut = ctx.createBuffer(buffer.numberOfChannels, to - from, rate);
    for (let c = 0; c < buffer.numberOfChannels; c++) cut.copyToChannel(buffer.getChannelData(c).subarray(from, to), c);
    buffer = cut;
    if (gain > 1.001 || gain < 0.999) buffer = await amplifyBuffer(buffer, gain);
  } finally {
    ctx.close().catch(() => {});
  }
  return encodeAudioBufferToMp3(buffer, onProgress);
}

/**
 * Bir video (veya herhangi bir ses/video) dosyasının ses kanalını decode edip MP3'e çevirir.
 * Orijinal dosyaya dokunmaz. Döner: ArrayBuffer (mp3 baytları).
 */
export async function extractAudioToMp3(url, onProgress) {
  const res = await fetch(url);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(await res.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }
  return encodeAudioBufferToMp3(buffer, onProgress);
}
