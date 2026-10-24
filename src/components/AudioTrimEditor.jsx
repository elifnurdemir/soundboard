import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { audioEngine } from '../audio/AudioEngine';

function toUrl(filePath) {
  if (/^(blob:|data:|https?:|file:)/.test(filePath)) return filePath;
  const n = filePath.replace(/\\/g, '/');
  return /^[A-Za-z]:/.test(n) ? `file:///${n}` : `file://${n}`;
}

function fmt(t) {
  if (!Number.isFinite(t)) return '0.0s';
  return `${t.toFixed(1)}s`;
}

const MIN_GAP = 0.05;
const BUCKET = 256; // samples per precomputed min/max bucket
const MIN_VIEW = 0.01; // en fazla 10 ms'lik pencereye kadar yakınlaşılır
const RULER_H = 16;

// Önceden hesaplanmış min/max kovaları — uzaklaştırılmış görünümde tüm dosyayı taramadan çizmeyi sağlar.
function buildBuckets(channel) {
  const n = Math.ceil(channel.length / BUCKET);
  const mins = new Float32Array(n);
  const maxs = new Float32Array(n);
  let globalPeak = 0.001;
  for (let b = 0; b < n; b++) {
    let lo = 1;
    let hi = -1;
    const end = Math.min(channel.length, (b + 1) * BUCKET);
    for (let i = b * BUCKET; i < end; i++) {
      const v = channel[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    mins[b] = lo;
    maxs[b] = hi;
    globalPeak = Math.max(globalPeak, Math.abs(lo), Math.abs(hi));
  }
  return { mins, maxs, globalPeak };
}

function peaksAt(data, t0, t1) {
  const { channel, sr, buckets } = data;
  const s0 = Math.max(0, Math.floor(t0 * sr));
  const s1 = Math.min(channel.length, Math.max(s0 + 1, Math.ceil(t1 * sr)));
  let lo = 1;
  let hi = -1;
  if (s1 - s0 >= BUCKET * 2) {
    const b0 = Math.floor(s0 / BUCKET);
    const b1 = Math.min(buckets.mins.length, Math.ceil(s1 / BUCKET));
    for (let b = b0; b < b1; b++) {
      if (buckets.mins[b] < lo) lo = buckets.mins[b];
      if (buckets.maxs[b] > hi) hi = buckets.maxs[b];
    }
  } else {
    for (let i = s0; i < s1; i++) {
      const v = channel[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo > hi ? [0, 0] : [lo, hi];
}

function rulerStep(viewDur, width) {
  const target = viewDur / Math.max(1, width / 90); // ~90px between labels
  const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s >= target) || 600;
}

function fmtTick(t, step) {
  if (step >= 1) {
    const m = Math.floor(t / 60);
    const s = Math.round(t - m * 60);
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }
  return `${t.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)}s`;
}

function TimeInput({ label, value, min, max, onCommit }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft == null) return;
    const n = Number.parseFloat(draft.replace(',', '.'));
    setDraft(null);
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
  };
  return (
    <label className="flex items-center gap-1 text-[10px] font-mono" style={{ color: '#5c665a' }}>
      {label}
      <input
        type="text" inputMode="decimal"
        value={draft ?? value.toFixed(3)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-16 bg-app-input border border-app-border px-1.5 py-0.5 text-[10px] text-white outline-none focus-lime font-mono"
      />
    </label>
  );
}

function ToolBtn({ children, onClick, title, active }) {
  return (
    <button
      type="button" onClick={onClick} title={title}
      className="px-2 py-1 text-[10px] font-bold font-mono tracking-wider bg-app-input border border-app-border hover:border-[rgba(196,255,0,0.3)] transition-colors"
      style={{ color: active ? 'var(--accent)' : '#8e9c8b' }}
    >
      {children}
    </button>
  );
}

const FX_DEFAULT = { volume: 0.8, bass: 0, treble: 0, reverb: 0, fadeIn: 0, fadeOut: 0, rate: 1 };
const FX_ROWS = [
  { key: 'volume', label: 'Ses seviyesi', min: 0, max: 5, step: 0.05, show: (v) => `%${Math.round(v * 100)}` },
  { key: 'bass', label: 'Bas', min: -12, max: 12, step: 1, show: (v) => (v === 0 ? 'kapalı' : `${v > 0 ? '+' : ''}${v} dB`) },
  { key: 'treble', label: 'Tiz', min: -12, max: 12, step: 1, show: (v) => (v === 0 ? 'kapalı' : `${v > 0 ? '+' : ''}${v} dB`) },
  { key: 'reverb', label: 'Yankı', min: 0, max: 1, step: 0.05, show: (v) => (v === 0 ? 'kapalı' : `%${Math.round(v * 100)}`) },
  { key: 'fadeIn', label: 'Belirme', min: 0, max: 5, step: 0.1, show: (v) => (v === 0 ? 'kapalı' : `${v.toFixed(1)} sn`) },
  { key: 'fadeOut', label: 'Sönme', min: 0, max: 5, step: 0.1, show: (v) => (v === 0 ? 'kapalı' : `${v.toFixed(1)} sn`) },
  { key: 'rate', label: 'Hız / perde', min: 0.5, max: 2, step: 0.05, show: (v) => (v === 1 ? 'normal' : `${v.toFixed(2)}x`) },
];

/** Ses seviyesi (%500'e kadar) ve efektler: önizlemede canlı duyulur, değerler Ses Ekle penceresiyle ortaktır. */
function FxPanel({ fx, onFx }) {
  return (
    <div className="border border-app-border bg-app-input p-3 space-y-2">
      <div className="grid gap-x-5 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {FX_ROWS.map((r) => (
          <label key={r.key} className="block">
            <span className="flex justify-between text-[10px] font-mono mb-1" style={{ color: '#8e9c8b' }}>
              <span>{r.label}</span>
              <span style={{ color: 'var(--accent)' }}>{r.show(fx[r.key])}</span>
            </span>
            <input
              type="range" min={r.min} max={r.max} step={r.step} value={fx[r.key]}
              onChange={(e) => onFx({ [r.key]: Number.parseFloat(e.target.value) })}
              className="w-full volume-slider"
              aria-label={r.label}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-mono" style={{ color: '#5c665a' }}>
          %100 üstü sesler sınırlayıcıdan geçer, patlama olmaz. Önizleme yalnızca senin hoparlöründen çıkar.
        </p>
        <ToolBtn onClick={() => onFx(FX_DEFAULT)} title="Ses ve efektleri varsayılana döndür">SIFIRLA</ToolBtn>
      </div>
    </div>
  );
}

/** Dalga formu + tutamaçlar + kaydırma çubuğu + araç çubuğu. Hem satır içi hem büyük görünümde kullanılır. */
function WaveEditor({
  data, view, setView, trimStart, effectiveEnd, onSelect, color, height,
  previewing, playheadTime, togglePreview, expanded, onToggleExpand, fx, onFx,
}) {
  const [fxOpen, setFxOpen] = useState(expanded);
  const duration = data.duration;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(0);
  const viewDur = view.end - view.start;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // ── Çizim ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const waveTop = RULER_H;
    const waveH = height - RULER_H;
    const mid = waveTop + waveH / 2;
    const amp = (waveH / 2) * 0.92 / data.buckets.globalPeak;
    const pxToT = (x) => view.start + (x / width) * viewDur;
    const tToPx = (t) => ((t - view.start) / viewDur) * width;

    // Cetvel
    const step = rulerStep(viewDur, width);
    ctx.font = '9px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#5c665a';
    ctx.strokeStyle = '#1e231e';
    ctx.lineWidth = 1;
    for (let t = Math.ceil(view.start / step) * step; t <= view.end; t += step) {
      const x = Math.round(tToPx(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, RULER_H - 5); ctx.lineTo(x, height); ctx.stroke();
      ctx.fillText(fmtTick(t, step), x + 3, 2);
    }

    // Orta çizgi
    ctx.strokeStyle = '#2a302a';
    ctx.beginPath(); ctx.moveTo(0, mid + 0.5); ctx.lineTo(width, mid + 0.5); ctx.stroke();

    // Dalga
    const selStartPx = tToPx(trimStart);
    const selEndPx = tToPx(effectiveEnd);
    for (let x = 0; x < width; x++) {
      const [lo, hi] = peaksAt(data, pxToT(x), pxToT(x + 1));
      const y0 = mid - hi * amp;
      const y1 = mid - lo * amp;
      ctx.globalAlpha = x >= selStartPx && x <= selEndPx ? 0.9 : 0.28;
      ctx.fillStyle = color;
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    ctx.globalAlpha = 1;

    // Seçim dışı karartma
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    if (selStartPx > 0) ctx.fillRect(0, waveTop, Math.min(width, selStartPx), waveH);
    if (selEndPx < width) ctx.fillRect(Math.max(0, selEndPx), waveTop, width - Math.max(0, selEndPx), waveH);

    // Oynatma çizgisi
    if (previewing && playheadTime != null) {
      const px = tToPx(playheadTime);
      if (px >= 0 && px <= width) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(px), waveTop, 2, waveH);
      }
    }
  }, [data, view, width, height, trimStart, effectiveEnd, color, previewing, playheadTime, viewDur]);

  const clampView = useCallback((start, dur) => {
    const d = Math.min(duration, Math.max(MIN_VIEW, dur));
    const s = Math.min(duration - d, Math.max(0, start));
    return { start: s, end: s + d };
  }, [duration]);

  const timeFromClientX = (clientX) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return view.start + pct * viewDur;
  };

  const zoomAt = useCallback((factor, centerT) => {
    setView((v) => {
      const dur = v.end - v.start;
      const newDur = Math.min(duration, Math.max(MIN_VIEW, dur * factor));
      const ratio = (centerT - v.start) / dur;
      const s = Math.min(duration - newDur, Math.max(0, centerT - ratio * newDur));
      return { start: s, end: s + newDur };
    });
  }, [duration, setView]);

  // Tekerlek: yakınlaştır/uzaklaştır (imleç etrafında), Shift veya yatay: kaydır
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const delta = (e.shiftKey ? e.deltaY : e.deltaX) || 0;
        setView((v) => {
          const dur = v.end - v.start;
          return clampView(v.start + (delta / rect.width) * dur, dur);
        });
        return;
      }
      const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      setView((v) => {
        const dur = v.end - v.start;
        const centerT = v.start + pct * dur;
        const newDur = Math.min(duration, Math.max(MIN_VIEW, dur * (e.deltaY > 0 ? 1.25 : 0.8)));
        const s = Math.min(duration - newDur, Math.max(0, centerT - pct * newDur));
        return { start: s, end: s + newDur };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [duration, setView, clampView]);

  // ── Tutamaç sürükleme ──
  const startHandleDrag = (which) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const onMove = (ev) => {
      const t = timeFromClientX(ev.clientX);
      if (which === 'start') onSelect(Math.max(0, Math.min(t, effectiveEnd - MIN_GAP)), effectiveEnd);
      else onSelect(trimStart, Math.min(duration, Math.max(t, trimStart + MIN_GAP)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Dalga üzerinde sürükleyerek yeni bölge seç (Audacity gibi) ──
  const startRegionDrag = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const anchorX = e.clientX;
    const anchorT = timeFromClientX(e.clientX);
    let moved = false;
    const onMove = (ev) => {
      if (!moved && Math.abs(ev.clientX - anchorX) < 4) return;
      moved = true;
      const t = timeFromClientX(ev.clientX);
      const a = Math.min(anchorT, t);
      const b = Math.max(anchorT, t);
      onSelect(a, Math.max(b, a + MIN_GAP));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Alt kaydırma çubuğu ──
  const trackRef = useRef(null);
  const thumbLeft = (view.start / duration) * 100;
  const thumbW = Math.max(2, (viewDur / duration) * 100);
  const startThumbDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = trackRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startView = view.start;
    const onMove = (ev) => {
      const dt = ((ev.clientX - startX) / rect.width) * duration;
      setView(clampView(startView + dt, viewDur));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const onTrackClick = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * duration;
    setView(clampView(t - viewDur / 2, viewDur));
  };

  const tToPct = (t) => ((t - view.start) / viewDur) * 100;
  const startPct = tToPct(trimStart);
  const endPct = tToPct(effectiveEnd);
  const zoomed = viewDur < duration - 0.001;

  const handle = (which, pct) => (pct < -0.5 || pct > 100.5 ? null : (
    <div
      onPointerDown={startHandleDrag(which)}
      className="absolute w-3 -ml-1.5 cursor-ew-resize flex justify-center group z-10"
      style={{ left: `${pct}%`, top: RULER_H, bottom: 0 }}
    >
      <div className="w-[3px] h-full group-hover:w-1 transition-all" style={{ background: 'var(--accent)' }}/>
    </div>
  ));

  return (
    <div className="space-y-2">
      {/* Araç çubuğu */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolBtn onClick={togglePreview} active={previewing} title="Seçili bölümü çal">
          {previewing ? '⏸ DURDUR' : '▶ ÖNİZLE'}
        </ToolBtn>
        <ToolBtn onClick={() => zoomAt(0.5, (view.start + view.end) / 2)} title="Yakınlaştır">＋</ToolBtn>
        <ToolBtn onClick={() => zoomAt(2, (view.start + view.end) / 2)} title="Uzaklaştır">－</ToolBtn>
        <ToolBtn
          onClick={() => {
            const pad = Math.max(MIN_GAP, (effectiveEnd - trimStart) * 0.1);
            setView(clampView(trimStart - pad, effectiveEnd - trimStart + pad * 2));
          }}
          title="Seçili bölgeye sığdır"
        >
          SEÇİME SIĞDIR
        </ToolBtn>
        <ToolBtn onClick={() => setView({ start: 0, end: duration })} title="Tüm dosyayı göster" active={!zoomed}>TÜMÜ</ToolBtn>
        {onFx && <ToolBtn onClick={() => setFxOpen((v) => !v)} title="Ses seviyesi (%500'e kadar) ve efektler" active={fxOpen}>{fxOpen ? '▾' : '▸'} SES VE EFEKTLER</ToolBtn>}
        <div className="flex-1" />
        <ToolBtn onClick={onToggleExpand} title={expanded ? 'Küçült' : 'Büyük pencerede aç'}>
          {expanded ? '✕ KÜÇÜLT' : '⤢ BÜYÜT'}
        </ToolBtn>
      </div>

      {onFx && fxOpen && <FxPanel fx={fx} onFx={onFx} />}

      {/* Dalga */}
      <div
        ref={wrapRef}
        className="relative select-none touch-none"
        style={{ height, cursor: 'crosshair' }}
        onPointerDown={startRegionDrag}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        {handle('start', startPct)}
        {handle('end', endPct)}
      </div>

      {/* Kaydırma çubuğu */}
      <div
        ref={trackRef}
        onPointerDown={onTrackClick}
        className="relative h-2.5 bg-app-input border border-app-border cursor-pointer"
        title="Kaydır"
      >
        <div
          onPointerDown={startThumbDrag}
          className="absolute inset-y-0 cursor-grab active:cursor-grabbing"
          style={{ left: `${thumbLeft}%`, width: `${thumbW}%`, background: zoomed ? 'var(--accent)' : '#2a302a', opacity: zoomed ? 0.6 : 1 }}
        />
      </div>

      {/* Sayısal giriş + bilgi */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <TimeInput
          label="Başlangıç" value={trimStart} min={0} max={effectiveEnd - MIN_GAP}
          onCommit={(v) => onSelect(v, effectiveEnd)}
        />
        <TimeInput
          label="Bitiş" value={effectiveEnd} min={trimStart + MIN_GAP} max={duration}
          onCommit={(v) => onSelect(trimStart, v)}
        />
        <span className="text-[10px] font-mono ml-auto" style={{ color: '#5c665a' }}>
          Kırpılan: {fmt(effectiveEnd - trimStart)} / Toplam: {fmt(duration)}
        </span>
      </div>
      <p className="text-[9px] font-mono" style={{ color: '#3c4238' }}>
        Boşluk: çal / durdur · Sürükle: bölge seç · Tekerlek: yakınlaştır · Shift+tekerlek: kaydır · Sarı çizgiler: ince ayar
      </p>
    </div>
  );
}

/**
 * Non-destructive trim editörü. Dosyayı değiştirmez —
 * sadece trimStart/trimEnd (saniye) üretir, çalma sırasında uygulanır.
 */
export default function AudioTrimEditor({ filePath, trimStart = 0, trimEnd = null, onChange, color = '#c4ff00', fx: fxProp, onFx }) {
  const fx = { ...FX_DEFAULT, ...(fxProp || {}) };
  const [data, setData] = useState(null); // { channel, sr, duration, buckets }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState({ start: 0, end: 1 });
  const [expanded, setExpanded] = useState(false);
  const [winH, setWinH] = useState(window.innerHeight);
  useEffect(() => {
    const onResize = () => setWinH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [previewing, setPreviewing] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(null);

  const ctxRef = useRef(null);
  const voiceRef = useRef(null);
  const rafRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    if (!filePath) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(toUrl(filePath));
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;
        if (!ctxRef.current) {
          ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const audioBuffer = await ctxRef.current.decodeAudioData(arrayBuffer);
        if (cancelled) return;
        const channel = audioBuffer.getChannelData(0);
        setData({
          channel, sr: audioBuffer.sampleRate, duration: audioBuffer.duration, buckets: buildBuckets(channel),
        });
        setView({ start: 0, end: audioBuffer.duration });
        setLoading(false);
      } catch (_) {
        if (!cancelled) {
          setError('Dalga formu yüklenemedi');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [filePath]);

  const stopPreview = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (voiceRef.current) {
      const v = voiceRef.current;
      voiceRef.current = null;
      v.stop();
    }
    setPreviewing(false);
    setPlayheadTime(null);
  }, []);

  // Dosya değişince / kapanınca önizlemeyi durdur
  useEffect(() => stopPreview, [filePath, stopPreview]);

  const duration = data?.duration || 0;
  const effectiveEnd = trimEnd != null ? Math.min(trimEnd, duration) : duration;

  const applySelection = (start, end) => {
    const s = Math.max(0, Math.min(start, duration - MIN_GAP));
    const e = Math.min(duration, Math.max(end, s + MIN_GAP));
    onChange({ trimStart: s, trimEnd: e >= duration - 0.005 ? null : e });
  };

  // Önizleme ana ses motorundan çalar (yalnızca hoparlör): ses seviyesi %500'e kadar ve efektler duyulur
  const togglePreview = async () => {
    if (voiceRef.current) { stopPreview(); return; }
    if (!filePath || !data) return;
    setPreviewing(true);
    try {
      const voice = await audioEngine.play(toUrl(filePath), {
        local: true, range: true,
        volume: fx.volume, rate: fx.rate, bass: fx.bass, treble: fx.treble, reverb: fx.reverb, fadeIn: fx.fadeIn, fadeOut: fx.fadeOut,
        trimStart, trimEnd: effectiveEnd >= duration - 0.005 ? null : effectiveEnd,
        onEnded: () => { if (voiceRef.current === voice) stopPreview(); },
      });
      voiceRef.current = voice;
      const tick = () => {
        if (voiceRef.current !== voice) return;
        setPlayheadTime(trimStart + voice.elapsed());
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (_) {
      stopPreview();
    }
  };
  toggleRef.current = togglePreview;

  // Sürgüler oynarken önizleme canlı değişsin
  useEffect(() => {
    const v = voiceRef.current;
    if (!v) return;
    v.setVolume(fx.volume);
    v.setFx({ bass: fx.bass, treble: fx.treble, reverb: fx.reverb });
  }, [fx.volume, fx.bass, fx.treble, fx.reverb]);

  // Boşluk tuşu her zaman çal / durdur (yazı alanlarında boşluk yazılır; sürgü ve düğmeler boşluğu yutmaz)
  useEffect(() => {
    const isTyping = (t) => !!t && (t.tagName === 'TEXTAREA' || t.isContentEditable
      || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'submit'].includes(t.type)));
    const onDown = (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (isTyping(e.target) || !toggleRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) toggleRef.current();
    };
    const onUp = (e) => {
      if ((e.code === 'Space' || e.key === ' ') && !isTyping(e.target)) e.preventDefault(); // odaktaki düğme boşlukla tıklanmasın
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => { window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp, true); };
  }, []);

  // Büyük görünüm: Escape sadece onu kapatsın (arkadaki modal kapanmasın)
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.stopImmediatePropagation(); setExpanded(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded]);

  if (!filePath) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-3 h-3 border-2 border-[rgba(196,255,0,0.6)] border-t-transparent rounded-full animate-spin"/>
        <span className="text-xs font-mono" style={{ color: '#5c665a' }}>Dalga formu analiz ediliyor...</span>
      </div>
    );
  }

  if (error || !data) {
    return <div className="h-8 flex items-center"><span className="text-xs font-mono" style={{ color: '#5c665a' }}>{error || ''}</span></div>;
  }

  const shared = {
    data, view, setView, trimStart, effectiveEnd, onSelect: applySelection, color,
    previewing, playheadTime, togglePreview, fx, onFx,
  };

  if (expanded) {
    return createPortal(
      <div
        className="fixed inset-0 z-[80] flex flex-col bg-app-bg p-5 gap-3"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] font-mono" style={{ color: 'var(--accent)' }}>
            KIRPMA EDİTÖRÜ
          </h2>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="px-4 py-1.5 text-xs font-bold font-mono tracking-wider btn-accent"
          >
            TAMAM (ESC)
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Cetvel, araç çubuğu, kaydırma çubuğu ve sayısal girişler için ~230px ayır */}
          <WaveEditor {...shared} height={Math.max(220, winH - 230)} expanded onToggleExpand={() => setExpanded(false)} />
        </div>
      </div>,
      document.body,
    );
  }

  return <WaveEditor {...shared} height={96} expanded={false} onToggleExpand={() => setExpanded(true)} />;
}
