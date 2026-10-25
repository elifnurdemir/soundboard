/**
 * AudioEngine — tek bir AudioContext üzerinden çalma.
 *
 * Her ses bir kez decode edilir, tek bir node zincirinden geçer ve sonra aynı anda
 * hem hoparlöre (ctx.destination) hem sanal kabloya (MediaStreamDestination → setSinkId)
 * dağıtılır. Böylece kırpma / fade / döngü / efektler ikisinde de birebir aynıdır.
 *
 *   source → bass → treble → volume → fade → out ─┬→ speakers
 *                                     └→ reverb send → convolver → out   └→ cable
 */

// Çözülmüş (decode edilmiş) sesler bellekte tutulur; en az kullanılan, bu bayt sınırı aşılınca atılır.
// 1 dakikalık stereo ses yaklaşık 21 MB eder; kırpılmış sesler yalnızca kırpılan kısım kadar yer tutar.
const CACHE_BYTES = 256 * 1024 * 1024;

class Voice {
  constructor(engine, nodes, meta) {
    this._engine = engine;
    this._n = nodes;
    this._startedAt = meta.startedAt;
    this._rate = meta.rate || 1;
    this._playDuration = meta.playDuration; // wall-clock seconds, Infinity when looping
    this._onEnded = meta.onEnded;
    this._done = false;
    this._silent = false;

    nodes.source.onended = () => this._finish(!this._silent);
  }

  /** Live volume (0..1) — used for slider / global volume changes. */
  setVolume(v) {
    if (this._done) return;
    const g = this._n.volume.gain;
    g.cancelScheduledValues(0);
    g.setValueAtTime(Math.max(0, v), this._engine.ctx.currentTime);
  }

  /** Canlı efekt ayarı (kırpma editörü önizlemesinde sürgüler oynarken). */
  setFx({ bass, treble, reverb }) {
    if (this._done) return;
    const t = this._engine.ctx.currentTime;
    if (bass != null) this._n.bass.gain.setTargetAtTime(bass, t, 0.01);
    if (treble != null) this._n.treble.gain.setTargetAtTime(treble, t, 0.01);
    if (reverb != null) this._n.send.gain.setTargetAtTime(Math.min(1, Math.max(0, reverb)) * 0.7, t, 0.01);
  }

  /** Başlangıçtan beri geçen süre (buffer saniyesi, hız dahil). */
  elapsed() {
    return Math.max(0, (this._engine.ctx.currentTime - this._startedAt) * this._rate);
  }

  /** Immediate stop. Does not fire onEnded (caller handles its own bookkeeping). */
  stop() {
    if (this._done) return;
    this._silent = true;
    try { this._n.source.stop(); } catch (_) { /* already stopped */ }
    this._finish(false);
  }

  /** Ramp to silence, then stop. */
  fadeOutAndStop(seconds) {
    if (this._done) return;
    if (seconds <= 0) { this.stop(); return; }
    const ctx = this._engine.ctx;
    const g = this._n.fade.gain;
    const now = ctx.currentTime;
    const cur = g.value;
    this._silent = true;
    g.cancelScheduledValues(now);
    g.setValueAtTime(cur, now);
    g.linearRampToValueAtTime(0, now + seconds);
    try { this._n.source.stop(now + seconds + 0.02); } catch (_) { /* already stopped */ }
  }

  _finish(fireCallback) {
    if (this._done) return;
    this._done = true;
    const n = this._n;
    [n.source, n.bass, n.treble, n.volume, n.fade, n.send].forEach((node) => {
      try { node.disconnect(); } catch (_) { /* noop */ }
    });
    if (fireCallback) this._onEnded?.();
  }
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.out = null;
    this.cableDest = null;
    this.cableCtx = null;
    this.cableDeviceId = null;
    this.reverbIn = null;
    this._buffers = new Map(); // anahtar (url|başlangıç|bitiş) → Promise<AudioBuffer>, en eski başta
    this._sizes = new Map(); // anahtar → bayt
    this._inflight = new Map(); // url → Promise<AudioBuffer> (aynı dosya iki kez çözülmesin)
    this._warming = false;
  }

  _ensure() {
    if (this.ctx) return this.ctx;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    // Ana yol limiter'sız: çalma ses seviyesi en çok %100, güçlendirme dosyaya işlenir. Limiter (eşik -2 dB, sert)
    // ses dolu dosyalarda sürekli devreye girip sesi sıkıştırıyordu; arkadaşlara kalın/boğuk gidiyordu.
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);

    this.cableDest = ctx.createMediaStreamDestination();
    this.out.connect(this.cableDest);

    // Shared reverb bus (voices only send into it when reverb > 0)
    const convolver = ctx.createConvolver();
    convolver.buffer = this._makeImpulse(ctx, 2.2, 3);
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(convolver);
    convolver.connect(this.out);

    // Yerel yol: yalnızca hoparlöre gider, sanal kabloya (arkadaşlara) geçmez. Kırpma editörü önizlemesi için.
    // Önizlemede Güçlendir %500'e çıkabildiği için burada limiter var: patlama olmasın, tepeler yumuşakça kısılsın
    this.localOut = ctx.createGain();
    const localLimiter = ctx.createDynamicsCompressor();
    localLimiter.threshold.value = -2; localLimiter.knee.value = 0; localLimiter.ratio.value = 20;
    localLimiter.attack.value = 0.002; localLimiter.release.value = 0.12;
    this.localOut.connect(localLimiter);
    localLimiter.connect(ctx.destination);
    const localConv = ctx.createConvolver();
    localConv.buffer = this._makeImpulse(ctx, 2.2, 3);
    this.localReverbIn = ctx.createGain();
    this.localReverbIn.connect(localConv);
    localConv.connect(this.localOut);

    if (this.cableDeviceId) this._attachCable();
    return ctx;
  }

  /** Decaying-noise impulse response — cheap, good-enough room reverb. */
  _makeImpulse(ctx, seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Route the cable output to a device. null = disabled. */
  async setCableDevice(deviceId) {
    this.cableDeviceId = deviceId || null;
    if (!this.ctx) return; // attached lazily in _ensure
    await this._attachCable();
  }

  async _attachCable() {
    if (!this.cableDeviceId) {
      if (this.cableCtx) { this.cableCtx.close().catch(() => {}); this.cableCtx = null; }
      return;
    }
    try {
      // Akışı <audio> öğesiyle kabloya vermek bir süre sonra sesi ~%11 yavaşlatıyordu (arkadaşlara pes gidiyordu).
      // Kablo için ayrı bir AudioContext, doğrudan o cihaza bağlanır.
      if (this.cableCtx && this.cableCtx.setSinkId) {
        await this.cableCtx.setSinkId(this.cableDeviceId);
      } else {
        this.cableCtx = new (window.AudioContext || window.webkitAudioContext)({ sinkId: this.cableDeviceId, latencyHint: 'interactive' });
        this.cableCtx.createMediaStreamSource(this.cableDest.stream).connect(this.cableCtx.destination);
      }
      await this.cableCtx.resume();
    } catch (e) {
      console.warn('Cable output failed:', e.message);
    }
  }

  // Dosyayı okuyup tamamını çözer (uzun videolar birkaç yüz ms sürebilir); aynı anda gelen istekler tek işi paylaşır
  _decodeFull(url) {
    let p = this._inflight.get(url);
    if (p) return p;
    const ctx = this._ensure();
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab));
    const done = () => this._inflight.delete(url);
    p.then(done, done);
    this._inflight.set(url, p);
    return p;
  }

  // Kırpılmışsa yalnızca kırpılan kısmı kopyalar (büyük dosyanın tamamı bellekte kalmaz)
  _slice(buffer, trimStart, trimEnd) {
    const rate = buffer.sampleRate;
    const from = Math.min(buffer.length - 1, Math.max(0, Math.floor((trimStart || 0) * rate)));
    const to = Math.min(buffer.length, trimEnd != null ? Math.max(from + 1, Math.floor(trimEnd * rate)) : buffer.length);
    if (from === 0 && to === buffer.length) return buffer;
    const cut = this.ctx.createBuffer(buffer.numberOfChannels, to - from, rate);
    for (let c = 0; c < buffer.numberOfChannels; c++) cut.copyToChannel(buffer.getChannelData(c).subarray(from, to), c);
    return cut;
  }

  _evict() {
    let total = 0;
    this._sizes.forEach((b) => { total += b; });
    for (const key of this._buffers.keys()) {
      if (total <= CACHE_BYTES || this._buffers.size <= 1) break;
      total -= this._sizes.get(key) || 0;
      this._buffers.delete(key);
      this._sizes.delete(key);
    }
  }

  // Çalmaya hazır (kırpılmış) buffer; bir kez hazırlanınca bellekten anında gelir
  _prepare(url, trimStart = 0, trimEnd = null) {
    const trimmed = trimStart > 0 || trimEnd != null;
    const key = url + '|' + (trimmed ? trimStart : 0) + '|' + (trimmed && trimEnd != null ? trimEnd : '');
    let p = this._buffers.get(key);
    if (p) {
      this._buffers.delete(key); // en son kullanılana taşı
      this._buffers.set(key, p);
      return p;
    }
    p = this._decodeFull(url).then((full) => {
      const buf = trimmed ? this._slice(full, trimStart, trimEnd) : full;
      this._sizes.set(key, buf.length * buf.numberOfChannels * 4);
      this._evict();
      return buf;
    });
    p.catch(() => { this._buffers.delete(key); this._sizes.delete(key); });
    this._buffers.set(key, p);
    return p;
  }

  preload(url, trimStart = 0, trimEnd = null) {
    return this._prepare(url, trimStart, trimEnd).catch(() => {});
  }

  /**
   * Tüm sesleri sırayla önceden hazırlar (açılışta). Böylece ilk basışta decode beklenmez.
   * items: [{ url, trimStart, trimEnd }], en çok kullanılan önce.
   */
  async warm(items) {
    if (this._warming) return;
    this._warming = true;
    try {
      for (const it of items) {
        await this.preload(it.url, it.trimStart, it.trimEnd);
        await new Promise((r) => setTimeout(r, 40)); // arayüz takılmasın
      }
    } finally {
      this._warming = false;
    }
  }

  /**
   * Start a sound. Resolves with a Voice once playback has been scheduled.
   * opts: volume, loop, rate, trimStart, trimEnd, fadeIn, fadeOut, bass, treble, reverb, onEnded
   */
  async play(url, opts = {}) {
    const ctx = this._ensure();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const {
      volume = 1, loop = false, rate = 1, trimStart = 0, trimEnd = null,
      fadeIn = 0, fadeOut = 0, bass = 0, treble = 0, reverb = 0, onEnded,
      local = false, // yalnızca hoparlöre (kabloya gitmez)
      range = false, // true: tam dosya bellekte kalır, kırpma ofsetle uygulanır (düzenleme sırasında sınırlar sık değişir)
    } = opts;
    // Kırpma buffer'ın kendisine uygulanır (hazırlanırken kesilir): çalma baştan sona, döngü de kırpılan kısımda döner
    const buffer = await this._prepare(url, range ? 0 : trimStart, range ? null : trimEnd);
    const hasTrim = range && (trimStart > 0 || trimEnd != null);
    const start = range ? Math.min(Math.max(0, trimStart), Math.max(0, buffer.duration - 0.01)) : 0;
    const end = range ? Math.min(buffer.duration, trimEnd != null ? trimEnd : buffer.duration) : buffer.duration;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const bassNode = ctx.createBiquadFilter();
    bassNode.type = 'lowshelf';
    bassNode.frequency.value = 120;
    bassNode.gain.value = bass;

    const trebleNode = ctx.createBiquadFilter();
    trebleNode.type = 'highshelf';
    trebleNode.frequency.value = 6000;
    trebleNode.gain.value = treble;

    const volumeNode = ctx.createGain();
    volumeNode.gain.value = volume;

    const fadeNode = ctx.createGain();
    const send = ctx.createGain();
    send.gain.value = Math.min(1, Math.max(0, reverb)) * 0.7;

    source.connect(bassNode);
    bassNode.connect(trebleNode);
    trebleNode.connect(volumeNode);
    volumeNode.connect(fadeNode);
    fadeNode.connect(local ? this.localOut : this.out);
    fadeNode.connect(send);
    send.connect(local ? this.localReverbIn : this.reverbIn);

    const t0 = ctx.currentTime + 0.01;
    const looping = loop;
    const playDuration = looping ? Infinity : Math.max(0.01, (end - start) / rate);

    // Fades
    const fg = fadeNode.gain;
    if (fadeIn > 0) {
      fg.setValueAtTime(0, t0);
      fg.linearRampToValueAtTime(1, t0 + fadeIn);
    } else {
      fg.setValueAtTime(1, t0);
    }
    if (!looping && fadeOut > 0) {
      const fo = Math.min(fadeOut, playDuration);
      const foStart = Math.max(t0 + (fadeIn > 0 ? fadeIn : 0), t0 + playDuration - fo);
      fg.setValueAtTime(1, foStart);
      fg.linearRampToValueAtTime(0, t0 + playDuration);
    }

    if (looping) {
      source.loop = true;
      if (hasTrim) {
        source.loopStart = start;
        source.loopEnd = end;
      }
      source.start(t0, start);
    } else if (hasTrim) {
      source.start(t0, start, end - start);
    } else {
      source.start(t0);
    }

    return new Voice(
      this,
      { source, bass: bassNode, treble: trebleNode, volume: volumeNode, fade: fadeNode, send },
      { startedAt: t0, playDuration, onEnded, rate },
    );
  }
}

export const audioEngine = new AudioEngine();
export default AudioEngine;
