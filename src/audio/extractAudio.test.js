import { describe, it, expect } from 'vitest';
import { encodeAudioBufferToMp3 } from './extractAudio.js';

// Node'da gerçek AudioBuffer yok: kodlayıcının kullandığı kısmı taklit eden bir nesne.
function fakeBuffer(channels, seconds, sampleRate = 44100) {
  const length = Math.floor(seconds * sampleRate);
  const data = [];
  for (let c = 0; c < channels; c++) {
    const ch = new Float32Array(length);
    for (let i = 0; i < length; i++) ch[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    data.push(ch);
  }
  return {
    numberOfChannels: channels,
    sampleRate,
    length,
    getChannelData: (c) => data[c],
  };
}

// MP3 dosyası ID3 etiketiyle ya da bir kare başlığıyla (0xFFEx) başlar.
function looksLikeMp3(bytes) {
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return id3 || frame;
}

describe('encodeAudioBufferToMp3', () => {
  it('stereo ses için geçerli bir MP3 üretir', async () => {
    const out = await encodeAudioBufferToMp3(fakeBuffer(2, 1));
    const bytes = new Uint8Array(out);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(looksLikeMp3(bytes)).toBe(true);
  });

  it('mono ses için de MP3 üretir', async () => {
    const out = await encodeAudioBufferToMp3(fakeBuffer(1, 1));
    expect(looksLikeMp3(new Uint8Array(out))).toBe(true);
  });

  it('daha uzun ses daha büyük dosya üretir', async () => {
    const short = await encodeAudioBufferToMp3(fakeBuffer(2, 1));
    const long = await encodeAudioBufferToMp3(fakeBuffer(2, 5));
    expect(long.byteLength).toBeGreaterThan(short.byteLength);
  });

  it('düşük bit hızı daha küçük dosya üretir', async () => {
    const buf = fakeBuffer(2, 2);
    const low = await encodeAudioBufferToMp3(buf, undefined, 32);
    const high = await encodeAudioBufferToMp3(buf, undefined, 192);
    expect(low.byteLength).toBeLessThan(high.byteLength);
  });

  it('ilerleme geri çağrısını çağırır ve sonunda 1 değerine yaklaşır', async () => {
    const seen = [];
    await encodeAudioBufferToMp3(fakeBuffer(2, 10), (p) => seen.push(p));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBeGreaterThanOrEqual(0);
    expect(seen[seen.length - 1]).toBeLessThanOrEqual(1);
  });
});
