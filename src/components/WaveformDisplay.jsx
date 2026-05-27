import { useEffect, useState, useRef } from 'react';

/**
 * Generates and displays a waveform from a local file path.
 * Uses Web Audio API to decode the audio, then renders bars as SVG.
 */
export default function WaveformDisplay({ filePath, color = '#6366f1', height = 40, bars = 60 }) {
  const [waveData, setWaveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    if (!filePath) { setWaveData(null); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // blob: / data: / http: → doğrudan kullan; Windows yolu → file:///
        let url;
        if (/^(blob:|data:|https?:|file:)/.test(filePath)) {
          url = filePath;
        } else {
          const n = filePath.replace(/\\/g, '/');
          url = /^[A-Za-z]:/.test(n) ? `file:///${n}` : `file://${n}`;
        }

        const res = await fetch(url);
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
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[start + j] || 0);
          }
          data.push(sum / blockSize);
        }

        // Normalize 0–1
        const max = Math.max(...data, 0.001);
        const normalized = data.map((v) => v / max);

        if (!cancelled) {
          setWaveData(normalized);
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
  }, [filePath, bars]);

  if (!filePath) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
        <span className="text-xs text-slate-500">Dalga formu analiz ediliyor...</span>
      </div>
    );
  }

  if (error || !waveData) {
    return (
      <div className="h-8 flex items-center">
        <span className="text-xs text-slate-600">{error || ''}</span>
      </div>
    );
  }

  const barWidth = Math.max(1, (300 - bars) / bars);
  const gap = 1;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${bars * (barWidth + gap)} ${height}`}
      preserveAspectRatio="none"
      className="w-full rounded"
      style={{ display: 'block' }}
    >
      {waveData.map((v, i) => {
        const barH = Math.max(2, v * height * 0.9);
        const x = i * (barWidth + gap);
        const y = (height - barH) / 2;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barH}
            rx={barWidth / 2}
            fill={color}
            opacity={0.5 + v * 0.5}
          />
        );
      })}
    </svg>
  );
}
