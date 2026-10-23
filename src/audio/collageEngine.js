/**
 * Kolaj motoru — çok kanallı projeyi çalar, çevrimdışı birleştirir ve mikrofondan kayıt alır.
 *
 * Proje şekli:
 *   tracks: [{ id, name, color, vol, pan, mute, solo, armed }]
 *   clips:  [{ id, trackId, name, src, srcDur, start, offset, dur, gain, fadeIn, fadeOut }]
 * Zaman saniye cinsinden. Klip: `src` dosyasının [offset, offset+dur] aralığını timeline'da `start`'ta çalar.
 */

export function toUrl(filePath) {
  if (/^(blob:|data:|https?:|file:)/.test(filePath)) return filePath;
  const n = filePath.replace(/\\/g, '/');
  return /^[A-Za-z]:/.test(n) ? `file:///${n}` : `file://${n}`;
}

// ─── Decode + dalga formu ───────────────────────────────────────────────────

let decodeCtx = null;
const bufferCache = new Map(); // src → Promise<AudioBuffer>

function getDecodeCtx() {
  if (!decodeCtx) decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  return decodeCtx;
}

export function loadBuffer(src) {
  let p = bufferCache.get(src);
  if (!p) {
    p = fetch(toUrl(src))
      .then((r) => r.arrayBuffer())
      .then((ab) => getDecodeCtx().decodeAudioData(ab));
    p.catch(() => bufferCache.delete(src));
    bufferCache.set(src, p);
  }
  return p;
}

const BUCKET = 256;
const peaksCache = new WeakMap(); // AudioBuffer → { mins, maxs }

export function getPeaks(buffer) {
  let p = peaksCache.get(buffer);
  if (p) return p;
  const ch = buffer.getChannelData(0);
  const n = Math.ceil(ch.length / BUCKET);
  const mins = new Float32Array(n);
  const maxs = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let lo = 1;
    let hi = -1;
    const end = Math.min(ch.length, (b + 1) * BUCKET);
    for (let i = b * BUCKET; i < end; i++) {
      const v = ch[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    mins[b] = lo;
    maxs[b] = hi;
  }
  p = { mins, maxs };
  peaksCache.set(buffer, p);
  return p;
}

/** Klibin görünen aralığını (offset..offset+dur) tuvale çizer. */
export function drawClipWave(canvas, buffer, { offset, dur, gain, color, clipColor = '#ff5a4d' }) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const { mins, maxs } = getPeaks(buffer);
  const sr = buffer.sampleRate;
  const ch = buffer.getChannelData(0);
  const mid = h / 2;
  const amp = (h / 2) * 0.94;
  for (let x = 0; x < w; x++) {
    const t0 = offset + (x / w) * dur;
    const t1 = offset + ((x + 1) / w) * dur;
    const s0 = Math.max(0, Math.floor(t0 * sr));
    const s1 = Math.min(ch.length, Math.max(s0 + 1, Math.ceil(t1 * sr)));
    let lo = 1;
    let hi = -1;
    if (s1 - s0 >= BUCKET * 2) {
      const b0 = Math.floor(s0 / BUCKET);
      const b1 = Math.min(mins.length, Math.ceil(s1 / BUCKET));
      for (let b = b0; b < b1; b++) {
        if (mins[b] < lo) lo = mins[b];
        if (maxs[b] > hi) hi = maxs[b];
      }
    } else {
      for (let i = s0; i < s1; i++) {
        const v = ch[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (lo > hi) { lo = 0; hi = 0; }
    const clipped = hi * gain > 1 || lo * gain < -1;
    const top = mid - Math.min(1, hi * gain) * amp;
    const bot = mid - Math.max(-1, lo * gain) * amp;
    ctx.fillStyle = clipped ? clipColor : color;
    ctx.fillRect(x, top, 1, Math.max(1, bot - top));
  }
}

// ─── Proje yardımcıları ─────────────────────────────────────────────────────

export function projectEnd(project) {
  return project.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
}

function audibleTrackIds(project) {
  const anySolo = project.tracks.some((t) => t.solo);
  return new Set(
    project.tracks.filter((t) => (anySolo ? t.solo : !t.mute)).map((t) => t.id),
  );
}

export async function loadProjectBuffers(project) {
  const srcs = [...new Set(project.clips.map((c) => c.src))];
  const entries = await Promise.all(
    srcs.map((s) => loadBuffer(s).then((b) => [s, b]).catch(() => [s, null])),
  );
  return new Map(entries.filter(([, b]) => b));
}

/**
 * Ses grafiğini kurar: klip → klip kazancı (fade) → kanal kazancı → pan → master → limiter → hedef.
 * `whenBase`: bağlamdaki zaman ki fromTime'a denk gelir. Döner: { trackNodes, sources, master }.
 */
export function buildGraph(ctx, dest, project, buffers, fromTime, whenBase) {
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  master.connect(limiter);
  limiter.connect(dest);

  const audible = audibleTrackIds(project);
  const trackNodes = new Map();
  project.tracks.forEach((t) => {
    const g = ctx.createGain();
    g.gain.value = audible.has(t.id) ? t.vol : 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = t.pan;
    g.connect(pan);
    pan.connect(master);
    trackNodes.set(t.id, { gain: g, pan });
  });

  const sources = [];
  project.clips.forEach((clip) => {
    const buffer = buffers.get(clip.src);
    const track = trackNodes.get(clip.trackId);
    if (!buffer || !track) return;
    const rel = fromTime - clip.start; // klibin kaçıncı saniyesindeyiz
    if (rel >= clip.dur) return;
    const skip = Math.max(0, rel);
    const delay = Math.max(0, -rel);
    const playDur = clip.dur - skip;
    if (playDur <= 0.001) return;

    const ctxAt = (local) => whenBase + (clip.start + local - fromTime);
    const env = (local) => {
      let e = 1;
      if (clip.fadeIn > 0 && local < clip.fadeIn) e *= local / clip.fadeIn;
      if (clip.fadeOut > 0 && local > clip.dur - clip.fadeOut) e *= Math.max(0, (clip.dur - local) / clip.fadeOut);
      return e;
    };

    const cg = ctx.createGain();
    const t0 = whenBase + delay;
    cg.gain.setValueAtTime(env(skip) * clip.gain, t0);
    if (clip.fadeIn > 0 && skip < clip.fadeIn) {
      cg.gain.linearRampToValueAtTime(clip.gain, ctxAt(clip.fadeIn));
    }
    if (clip.fadeOut > 0) {
      const a = Math.max(clip.dur - clip.fadeOut, skip, clip.fadeIn > skip ? clip.fadeIn : skip);
      cg.gain.setValueAtTime(env(a) * clip.gain, ctxAt(a));
      cg.gain.linearRampToValueAtTime(0, ctxAt(clip.dur));
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(cg);
    cg.connect(track.gain);
    src.start(t0, clip.offset + skip, playDur);
    sources.push(src);
  });

  return { trackNodes, sources, master };
}

// ─── Çalma ──────────────────────────────────────────────────────────────────

export class CollagePlayer {
  constructor() {
    this.ctx = null;
    this.graph = null;
    this.playing = false;
    this._raf = 0;
    this._t0 = 0;
    this._from = 0;
    this._token = 0; // yarış önleme: eski bir play() sonradan başlamasın
  }

  _ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  get position() {
    if (!this.playing) return this._from;
    return this._from + (this.ctx.currentTime - this._t0);
  }

  /** endless: kayıt sırasında proje bitse de akmaya devam eder. */
  async play(project, from, { onTick, onEnd, endless = false } = {}) {
    this.stop();
    const token = this._token;
    const buffers = await loadProjectBuffers(project);
    if (token !== this._token) return; // bu arada stop() ya da yeni play() çağrıldı
    const ctx = this._ensure();
    this._t0 = ctx.currentTime + 0.05;
    this._from = from;
    this.graph = buildGraph(ctx, ctx.destination, project, buffers, from, this._t0);
    this.playing = true;
    this._project = project;
    const end = projectEnd(project);

    const tick = () => {
      if (!this.playing) return;
      const pos = this.position;
      onTick?.(Math.max(from, pos));
      if (!endless && pos >= end + 0.05) {
        this.stop();
        onEnd?.();
        return;
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  /** Çalarken kanal ses/pan/mute/solo değişikliklerini anında uygular. */
  updateTracks(project) {
    if (!this.playing || !this.graph) return;
    const audible = audibleTrackIds(project);
    const now = this.ctx.currentTime;
    project.tracks.forEach((t) => {
      const n = this.graph.trackNodes.get(t.id);
      if (!n) return;
      n.gain.gain.setTargetAtTime(audible.has(t.id) ? t.vol : 0, now, 0.01);
      n.pan.pan.setTargetAtTime(t.pan, now, 0.01);
    });
  }

  stop() {
    this._token += 1;
    const pos = this.position;
    cancelAnimationFrame(this._raf);
    if (this.graph) {
      this.graph.sources.forEach((s) => { try { s.stop(); } catch (_) { /* bitmiş */ } });
      try { this.graph.master.disconnect(); } catch (_) { /* noop */ }
      this.graph = null;
    }
    this._from = pos;
    this.playing = false;
    return pos;
  }
}

// ─── Çevrimdışı birleştirme ─────────────────────────────────────────────────

export async function renderProject(project, { normalize = true } = {}) {
  const buffers = await loadProjectBuffers(project);
  const sr = 44100;
  const length = Math.max(0.1, projectEnd(project) + 0.3);
  const off = new OfflineAudioContext(2, Math.ceil(length * sr), sr);
  buildGraph(off, off.destination, project, buffers, 0, 0);
  const rendered = await off.startRendering();

  if (normalize) {
    let peak = 0;
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      const d = rendered.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
      }
    }
    if (peak > 0.0001) {
      const g = Math.min(10, 0.891 / peak); // −1 dBFS
      for (let c = 0; c < rendered.numberOfChannels; c++) {
        const d = rendered.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= g;
      }
    }
  }
  return rendered;
}

// ─── Mikrofon kaydı ─────────────────────────────────────────────────────────

/**
 * Mikrofonu hazırlar (izin ister, seviye ölçer) ama kaydı başlatmaz — geri sayım bitince begin() çağrılır.
 * Döner: { begin(), stop(): Promise<{ arrayBuffer, ext }> }.
 * monitor: kendini hoparlörden duy (kulaklık önerilir, yoksa geri besleme olur).
 */
export async function prepareRecording({ onLevel, monitor = false } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    .find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  if (monitor) src.connect(ctx.destination);

  const buf = new Float32Array(analyser.fftSize);
  let raf = 0;
  const meter = () => {
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    onLevel?.(peak);
    raf = requestAnimationFrame(meter);
  };
  raf = requestAnimationFrame(meter);

  return {
    begin: () => recorder.start(),
    stop: () => new Promise((resolve) => {
      recorder.onstop = async () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        resolve({ arrayBuffer: await blob.arrayBuffer(), ext: type.includes('ogg') ? 'ogg' : 'webm' });
      };
      recorder.stop();
    }),
  };
}

/** Geri sayım bip'leri (n kez, aralık ms). Biter bitmez resolve eder. */
export function countIn(n = 3, intervalMs = 600) {
  return new Promise((resolve) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i === n - 1 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + (i * intervalMs) / 1000);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + (i * intervalMs) / 1000 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i * intervalMs) / 1000 + 0.15);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0 + (i * intervalMs) / 1000);
      o.stop(t0 + (i * intervalMs) / 1000 + 0.2);
    }
    setTimeout(() => { ctx.close().catch(() => {}); resolve(); }, n * intervalMs + 100);
  });
}
