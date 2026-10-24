/**
 * VoiceChanger — mikrofon için gerçek zamanlı pitch / robot / yankı zinciri.
 *
 *   input → [pitch shift | bypass] → [ring-mod "robot" | bypass] → [echo] → [telsiz | bypass] → [mağara | bypass] → output
 *
 * Pitch shift: iki gecikme hattı (delay tap), gecikme süresi testere dişi ile
 * sürekli kaydırılıyor (Doppler → perde değişimi) ve sin² pencereleriyle
 * çapraz solduruluyor, böylece toplam kazanç sabit kalır.
 */

// seconds — shift window length (also ≈ max added latency). Uzun pencere (≥100 ms) yankı gibi
// duyulur, çok kısa pencere vızıltı yapar; ~60 ms konuşma için makul bir orta nokta.
const PERIOD = 0.06;

// radio: telsiz/telefon sesi (dar bant + hafif bozulma), cave: mağara yankısı miktarı (0..1)
export const VOICE_PRESETS = [
  { id: 'normal', label: 'Normal', pitch: 0, robot: false, echo: 0, radio: false, cave: 0 },
  { id: 'chipmunk', label: 'Sincap', pitch: 7, robot: false, echo: 0, radio: false, cave: 0 },
  { id: 'deep', label: 'Kalın', pitch: -5, robot: false, echo: 0, radio: false, cave: 0 },
  { id: 'robot', label: 'Robot', pitch: 0, robot: true, echo: 0, radio: false, cave: 0 },
  { id: 'echo', label: 'Yankı', pitch: 0, robot: false, echo: 0.45, radio: false, cave: 0 },
  { id: 'monster', label: 'Canavar', pitch: -9, robot: false, echo: 0.3, radio: false, cave: 0 },
  { id: 'alien', label: 'Uzaylı', pitch: 4, robot: true, echo: 0.2, radio: false, cave: 0 },
  { id: 'radio', label: 'Telsiz', pitch: 0, robot: false, echo: 0, radio: true, cave: 0 },
  { id: 'cave', label: 'Mağara', pitch: -2, robot: false, echo: 0.12, radio: false, cave: 0.6 },
];

export const PRESET_DEFAULT = VOICE_PRESETS[0];

// Mağara için sentetik dürtü yanıtı: üstel sönen gürültü (2 sn)
function makeImpulse(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

// Hafif doyum eğrisi (telsizin hafif bozuk sesi)
function makeDriveCurve(amount = 12) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

function makeRampBuffer(ctx, fn) {
  const len = Math.floor(ctx.sampleRate * PERIOD);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = fn(i / len);
  return buf;
}

export class VoiceChanger {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this._sources = []; // looping modulators — stopped on destroy
    this.params = { pitch: 0, robot: false, echo: 0, radio: false, cave: 0 };
    this.core = ctx.createGain(); // pitch/robot/yankı zincirinin çıkışı; telsiz ve mağara bunun ardından

    // ── Stage 1: pitch ──
    this.pitchDry = ctx.createGain();
    this.pitchWet = ctx.createGain();
    this.pitchOut = ctx.createGain();
    this.input.connect(this.pitchDry);
    this.pitchDry.connect(this.pitchOut);
    this.pitchWet.connect(this.pitchOut);
    this.taps = this._buildPitchTaps();

    // ── Stage 2: robot (ring modulation, 50 Hz carrier) ──
    this.robotDry = ctx.createGain();
    this.robotWet = ctx.createGain();
    this.robotOut = ctx.createGain();
    this.pitchOut.connect(this.robotDry);
    this.robotDry.connect(this.robotOut);
    const ring = ctx.createGain();
    ring.gain.value = 0; // carrier drives the gain: gain = carrier(t)
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 50;
    carrier.connect(ring.gain);
    carrier.start();
    this._sources.push(carrier);
    this.pitchOut.connect(ring);
    ring.connect(this.robotWet);
    this.robotWet.connect(this.robotOut);

    // ── Stage 3: echo ──
    this.echoDelay = ctx.createDelay(1);
    this.echoDelay.delayTime.value = 0.26;
    this.echoFeedback = ctx.createGain();
    this.echoFeedback.gain.value = 0.38;
    this.echoSend = ctx.createGain();
    this.robotOut.connect(this.core);
    this.robotOut.connect(this.echoSend);
    this.echoSend.connect(this.echoDelay);
    this.echoDelay.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoDelay);
    this.echoDelay.connect(this.core);

    // ── Stage 4: telsiz (300–3300 Hz bant + hafif bozulma) ──
    this.radioDry = ctx.createGain();
    this.radioWet = ctx.createGain();
    this.radioOut = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320; hp.Q.value = 0.9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3300; lp.Q.value = 0.9;
    const drive = ctx.createWaveShaper(); drive.curve = makeDriveCurve(); drive.oversample = '2x';
    const radioLevel = ctx.createGain(); radioLevel.gain.value = 0.7;
    this.core.connect(this.radioDry);
    this.radioDry.connect(this.radioOut);
    this.core.connect(hp); hp.connect(lp); lp.connect(drive); drive.connect(radioLevel); radioLevel.connect(this.radioWet);
    this.radioWet.connect(this.radioOut);

    // ── Stage 5: mağara (sentetik dürtü yanıtıyla yankı) ──
    this.caveWet = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    this.radioOut.connect(this.output);
    this.radioOut.connect(convolver);
    convolver.connect(this.caveWet);
    this.caveWet.connect(this.output);

    this.set(this.params);
  }

  _buildPitchTaps() {
    const ctx = this.ctx;
    const ramp = makeRampBuffer(ctx, (p) => p);
    const win = makeRampBuffer(ctx, (p) => Math.sin(Math.PI * p) ** 2);
    const t0 = ctx.currentTime + 0.05;
    const taps = [];

    for (const offset of [0, PERIOD / 2]) {
      const delay = ctx.createDelay(1);
      const swing = ctx.createGain(); // scaled ramp → delayTime
      const fade = ctx.createGain(); // window gain
      fade.gain.value = 0;

      const rampSrc = ctx.createBufferSource();
      rampSrc.buffer = ramp;
      rampSrc.loop = true;
      rampSrc.connect(swing);
      swing.connect(delay.delayTime);

      const winSrc = ctx.createBufferSource();
      winSrc.buffer = win;
      winSrc.loop = true;
      winSrc.connect(fade.gain);

      rampSrc.start(t0, offset);
      winSrc.start(t0, offset);
      this._sources.push(rampSrc, winSrc);

      this.input.connect(delay);
      delay.connect(fade);
      fade.connect(this.pitchWet);
      taps.push({ delay, swing });
    }
    return taps;
  }

  /** params: { pitch: semitones (-12..12), robot: bool, echo: 0..1, radio: bool, cave: 0..1 } */
  set(params) {
    this.params = { ...this.params, ...params };
    const { pitch, robot, echo, radio, cave } = this.params;
    const t = this.ctx.currentTime;

    // Pitch: ratio r → delay slope (1 - r). Window length PERIOD → swing = |1 - r| * PERIOD.
    const ratio = 2 ** (pitch / 12);
    const swing = Math.abs(1 - ratio) * PERIOD;
    const up = ratio > 1;
    const shifting = pitch !== 0;
    this.taps.forEach(({ delay, swing: node }) => {
      node.gain.setTargetAtTime(up ? -swing : swing, t, 0.02);
      delay.delayTime.setTargetAtTime(up ? swing : 0, t, 0.02);
    });
    this.pitchWet.gain.setTargetAtTime(shifting ? 1 : 0, t, 0.02);
    this.pitchDry.gain.setTargetAtTime(shifting ? 0 : 1, t, 0.02);

    this.robotWet.gain.setTargetAtTime(robot ? 1.4 : 0, t, 0.02);
    this.robotDry.gain.setTargetAtTime(robot ? 0 : 1, t, 0.02);

    this.echoSend.gain.setTargetAtTime(Math.min(1, Math.max(0, echo)), t, 0.02);

    this.radioWet.gain.setTargetAtTime(radio ? 1 : 0, t, 0.02);
    this.radioDry.gain.setTargetAtTime(radio ? 0 : 1, t, 0.02);
    this.caveWet.gain.setTargetAtTime(Math.min(1, Math.max(0, cave || 0)) * 0.9, t, 0.02);
  }

  destroy() {
    this._sources.forEach((s) => { try { s.stop(); } catch (_) { /* noop */ } });
    this._sources = [];
    try { this.input.disconnect(); } catch (_) { /* noop */ }
    try { this.output.disconnect(); } catch (_) { /* noop */ }
  }
}
