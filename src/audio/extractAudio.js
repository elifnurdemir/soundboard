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
