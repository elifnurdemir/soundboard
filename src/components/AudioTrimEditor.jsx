import { useState, useEffect, useRef, useCallback } from 'react';

function toUrl(filePath) {
  if (/^(blob:|data:|https?:|file:)/.test(filePath)) return filePath;
  const n = filePath.replace(/\\/g, '/');
  return /^[A-Za-z]:/.test(n) ? `file:///${n}` : `file://${n}`;
}

function fmt(t) {
  if (!isFinite(t)) return '0.0s';
  return `${t.toFixed(1)}s`;
}

const MIN_GAP = 0.05;

/**
 * Basit, non-destructive trim editörü. Dosyayı değiştirmez —
 * sadece trimStart/trimEnd (saniye) üretir, çalma sırasında uygulanır.
 */
export default function AudioTrimEditor({ filePath, trimStart = 0, trimEnd = null, onChange, color = '#c4ff00' }) {
  const [waveData, setWaveData] = useState(null);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [playheadPct, setPlayheadPct] = useState(null);

  const ctxRef = useRef(null);
  const containerRef = useRef(null);
  const previewAudioRef = useRef(null);
  const dragRef = useRef(null); // 'start' | 'end' | null

  const bars = 100;

  useEffect(() => {
    if (!filePath) { setWaveData(null); setDuration(0); return; }
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

        const channelData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(channelData.length / bars);
        const data = [];
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          const start = i * blockSize;
          for (let j = 0; j < blockSize; j++) sum += Math.abs(channelData[start + j] || 0);
          data.push(sum / blockSize);
        }
        const max = Math.max(...data, 0.001);

        if (!cancelled) {
          setWaveData(data.map((v) => v / max));
          setDuration(audioBuffer.duration);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Dalga formu yüklenemedi');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [filePath]);

  // Stop preview when file changes/unmounts
  useEffect(() => () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
    }
  }, [filePath]);

  const effectiveEnd = trimEnd != null ? trimEnd : duration;

  const timeFromClientX = useCallback((clientX) => {
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return pct * duration;
  }, [duration]);

  const handlePointerDown = (which) => (e) => {
    if (!duration) return;
    e.preventDefault();
    dragRef.current = which;

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const t = timeFromClientX(ev.clientX);
      if (dragRef.current === 'start') {
        const newStart = Math.min(t, effectiveEnd - MIN_GAP);
        onChange({ trimStart: Math.max(0, newStart), trimEnd });
      } else {
        const newEnd = Math.max(t, trimStart + MIN_GAP);
        onChange({ trimStart, trimEnd: Math.min(duration, newEnd) });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const togglePreview = () => {
    if (previewing) {
      previewAudioRef.current?.pause();
      setPreviewing(false);
      setPlayheadPct(null);
      return;
    }
    const audio = new Audio(toUrl(filePath));
    previewAudioRef.current = audio;
    audio.currentTime = trimStart;
    const onTime = () => {
      setPlayheadPct((audio.currentTime / duration) * 100);
      if (audio.currentTime >= effectiveEnd) {
        audio.pause();
        setPreviewing(false);
        setPlayheadPct(null);
      }
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', () => { setPreviewing(false); setPlayheadPct(null); });
    audio.play().catch(() => setPreviewing(false));
    setPreviewing(true);
  };

  if (!filePath) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-3 h-3 border-2 border-[rgba(196,255,0,0.6)] border-t-transparent rounded-full animate-spin"/>
        <span className="text-xs font-mono" style={{ color: '#5c665a' }}>Dalga formu analiz ediliyor...</span>
      </div>
    );
  }

  if (error || !waveData) {
    return <div className="h-8 flex items-center"><span className="text-xs font-mono" style={{ color: '#5c665a' }}>{error || ''}</span></div>;
  }

  const startPct = duration ? (trimStart / duration) * 100 : 0;
  const endPct = duration ? (effectiveEnd / duration) * 100 : 100;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative h-14 select-none touch-none"
        style={{ cursor: 'default' }}
      >
        {/* Waveform bars */}
        <svg width="100%" height="100%" viewBox={`0 0 ${bars} 56`} preserveAspectRatio="none" className="w-full h-full block">
          {waveData.map((v, i) => {
            const barH = Math.max(2, v * 56 * 0.9);
            const inSelection = i >= (startPct / 100) * bars && i <= (endPct / 100) * bars;
            return (
              <rect
                key={i}
                x={i} y={(56 - barH) / 2}
                width={0.85} height={barH}
                fill={color}
                opacity={inSelection ? 0.5 + v * 0.5 : 0.15}
              />
            );
          })}
        </svg>

        {/* Dimmed overlays outside selection */}
        <div className="absolute inset-y-0 left-0 bg-black/50 pointer-events-none" style={{ width: `${startPct}%` }}/>
        <div className="absolute inset-y-0 right-0 bg-black/50 pointer-events-none" style={{ width: `${100 - endPct}%` }}/>

        {/* Playhead */}
        {previewing && playheadPct != null && (
          <div className="absolute inset-y-0 w-[2px] bg-white pointer-events-none" style={{ left: `${playheadPct}%` }}/>
        )}

        {/* Start handle */}
        <div
          onPointerDown={handlePointerDown('start')}
          className="absolute inset-y-0 w-2 -ml-1 cursor-ew-resize flex items-center justify-center group"
          style={{ left: `${startPct}%` }}
        >
          <div className="w-[3px] h-full group-hover:w-1 transition-all" style={{ background: 'var(--accent)' }}/>
        </div>

        {/* End handle */}
        <div
          onPointerDown={handlePointerDown('end')}
          className="absolute inset-y-0 w-2 -ml-1 cursor-ew-resize flex items-center justify-center group"
          style={{ left: `${endPct}%` }}
        >
          <div className="w-[3px] h-full group-hover:w-1 transition-all" style={{ background: 'var(--accent)' }}/>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={togglePreview}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold font-mono tracking-wider bg-app-input border border-app-border hover:border-[rgba(196,255,0,0.3)] transition-colors"
          style={{ color: previewing ? 'var(--accent)' : '#8e9c8b' }}
        >
          {previewing ? '⏸ DURDUR' : '▶ ÖNİZLE'}
        </button>
        <span className="text-[10px] font-mono" style={{ color: '#5c665a' }}>
          Kırpılan: {fmt(effectiveEnd - trimStart)} / Toplam: {fmt(duration)}
        </span>
      </div>
    </div>
  );
}
