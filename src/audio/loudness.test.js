import { describe, it, expect } from 'vitest';
import { measureLoudness, normalizationGain, targetLufsFor } from './loudness';

const sine = (freq, amp, seconds, fs) => {
  const x = new Float32Array(Math.round(seconds * fs));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs);
  return x;
};
const silence = (seconds, fs) => new Float32Array(Math.round(seconds * fs));

describe('measureLoudness (BS.1770-4)', () => {
  // Standardın kalibrasyon şartı: 0 dBFS 997 Hz sinüs tek kanalda -3.01 LKFS ölçülür
  it('0 dBFS 997 Hz sinüs, stereo dosyanın tek kanalında -3.01 LUFS', () => {
    for (const fs of [44100, 48000]) {
      const { lufs, peak } = measureLoudness([sine(997, 1, 5, fs), silence(5, fs)], fs);
      expect(lufs).toBeCloseTo(-3.01, 1);
      expect(peak).toBeCloseTo(1, 2);
    }
  });

  it('-20 dBFS sinüs 20 dB daha sessiz ölçülür', () => {
    const fs = 48000;
    const loud = measureLoudness([sine(997, 1, 3, fs), silence(3, fs)], fs).lufs;
    const quiet = measureLoudness([sine(997, 0.1, 3, fs), silence(3, fs)], fs).lufs;
    expect(loud - quiet).toBeCloseTo(20, 1);
  });

  it('tek kanallı (mono) dosya iki hoparlöre gittiği için stereo kopyasıyla aynı ölçülür', () => {
    const fs = 48000;
    const x = sine(500, 0.5, 2, fs);
    expect(measureLoudness([x], fs).lufs).toBeCloseTo(measureLoudness([x, x], fs).lufs, 3);
  });

  it('sessiz kısımlar ortalamayı düşürmez (kapılama)', () => {
    const fs = 48000;
    const tone = sine(997, 0.5, 2, fs);
    const withGap = new Float32Array(tone.length + fs * 8);
    withGap.set(tone, 0);
    const a = measureLoudness([tone, tone], fs).lufs;
    const b = measureLoudness([withGap, withGap], fs).lufs;
    expect(Math.abs(a - b)).toBeLessThan(0.5);
  });

  it('400 ms den kısa sesi de ölçer, tamamen sessiz ses -Infinity', () => {
    const fs = 48000;
    expect(Number.isFinite(measureLoudness([sine(997, 0.5, 0.15, fs)], fs).lufs)).toBe(true);
    expect(measureLoudness([silence(1, fs)], fs).lufs).toBe(-Infinity);
  });

  it('bas sesler (40 Hz altı) K-ağırlıklamayla daha sessiz sayılır', () => {
    const fs = 48000;
    const low = measureLoudness([sine(30, 0.5, 2, fs)], fs).lufs;
    const mid = measureLoudness([sine(1000, 0.5, 2, fs)], fs).lufs;
    expect(mid - low).toBeGreaterThan(2);
  });
});

describe('normalizationGain', () => {
  const db = (g) => 20 * Math.log10(g);

  it('yüksek sesi hedefe kadar kısar', () => {
    expect(db(normalizationGain({ lufs: -6, peak: 1 }, -16))).toBeCloseTo(-10, 5);
  });

  it('sessiz sesi yükseltir ama tepe 0.95 i geçmez', () => {
    // -30 LUFS → -16 için 14 dB gerekir; tepe 0.3 olduğundan en çok 0.95/0.3 (≈10 dB)
    const g = normalizationGain({ lufs: -30, peak: 0.3 }, -16);
    expect(g * 0.3).toBeCloseTo(0.95, 5);
  });

  it('yükseltme en çok 12 dB', () => {
    expect(db(normalizationGain({ lufs: -60, peak: 0.001 }, -16))).toBeCloseTo(12, 5);
  });

  it('tepe zaten tavandaysa yükseltmez, ölçüm yoksa dokunmaz', () => {
    expect(normalizationGain({ lufs: -25, peak: 1 }, -16)).toBe(1);
    expect(normalizationGain(null, -16)).toBe(1);
    expect(normalizationGain({ lufs: -Infinity, peak: 0 }, -16)).toBe(1);
  });

  it('bilinmeyen hedef Normal (-16) sayılır', () => {
    expect(targetLufsFor('loud')).toBe(-12);
    expect(targetLufsFor('yok')).toBe(-16);
  });
});

describe('K-ağırlıklama katsayıları', () => {
  it('48 kHz de standardın (BS.1770-4 Tablo 1) katsayılarıyla aynı', async () => {
    const { _coeffs } = await import('./loudness');
    const { sh, hp } = _coeffs(48000);
    expect(sh.b0).toBeCloseTo(1.53512485958697, 6);
    expect(sh.b1).toBeCloseTo(-2.69169618940638, 6);
    expect(sh.b2).toBeCloseTo(1.19839281085285, 6);
    expect(sh.a1).toBeCloseTo(-1.69065929318241, 6);
    expect(sh.a2).toBeCloseTo(0.73248077421585, 6);
    expect(hp.a1).toBeCloseTo(-1.99004745483398, 6);
    expect(hp.a2).toBeCloseTo(0.99007225036621, 6);
  });
});
