import { useState, useEffect, useRef } from 'react';
import useSoundStore from '../store/useSoundStore';
import { audioEngine } from '../audio/AudioEngine';

// Yazıdan sese: metni Windows'un (Linux'ta espeak-ng) kendi sesiyle okutur.
// Arkadaşlara çal → hoparlör + sanal kablo (butona basmak gibi). Kendim dinle → yalnızca hoparlör.
const MAX_CHARS = 1000;

const toUrl = (p) => {
  const n = p.replace(/\\/g, '/');
  return /^[A-Za-z]:/.test(n) ? `file:///${n}` : `file://${n}`;
};

export default function TtsPanel() {
  const closeTts = useSoundStore((s) => s.closeTts);
  const settings = useSoundStore((s) => s.settings);
  const updateSettings = useSoundStore((s) => s.updateSettings);
  const openAddModalWithFile = useSoundStore((s) => s.openAddModalWithFile);
  const prefs = { voiceId: '', rate: 1, pitch: 1, ...(settings.tts || {}) };
  const setPrefs = (u) => updateSettings({ tts: { ...prefs, ...u } });

  const [text, setText] = useState('');
  const [voices, setVoices] = useState(null); // null: yükleniyor
  const [hint, setHint] = useState(null);
  const [busy, setBusy] = useState(null);     // 'friends' | 'local' | 'add'
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState([]);
  const cache = useRef(new Map()); // aynı metin + ayar için yeniden üretme
  const voiceRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') closeTts(); };
    window.addEventListener('keydown', h);
    textRef.current?.focus();
    return () => { window.removeEventListener('keydown', h); voiceRef.current?.stop(); };
  }, []);

  useEffect(() => {
    window.electronAPI?.ttsVoices().then((r) => {
      setVoices(r?.voices || []);
      setHint(r?.success ? r.hint : (r?.error || 'Sesler alınamadı'));
    });
  }, []);

  const voiceId = voices?.some((v) => v.id === prefs.voiceId) ? prefs.voiceId : voices?.[0]?.id || '';

  const synth = async (t) => {
    const key = [t, voiceId, prefs.rate, prefs.pitch].join('|');
    if (cache.current.has(key)) return cache.current.get(key);
    const r = await window.electronAPI.ttsSpeak({ text: t, voiceId, rate: prefs.rate, pitch: prefs.pitch });
    if (!r?.success) throw new Error(r?.error || 'Seslendirilemedi');
    cache.current.set(key, r.filePath);
    return r.filePath;
  };

  const run = async (mode, t = text) => {
    const clean = t.trim();
    if (!clean || busy) return;
    setBusy(mode); setError(null);
    try {
      const filePath = await synth(clean);
      setRecent((r) => [clean, ...r.filter((x) => x !== clean)].slice(0, 5));
      if (mode === 'add') {
        closeTts();
        openAddModalWithFile(filePath, clean.length > 40 ? `${clean.slice(0, 40).trim()}…` : clean);
        return;
      }
      voiceRef.current?.stop();
      const voice = await audioEngine.play(toUrl(filePath), {
        volume: settings.globalVolume ?? 1,
        local: mode === 'local',
        onEnded: () => { if (voiceRef.current === voice) setPlaying(false); },
      });
      voiceRef.current = voice;
      setPlaying(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const stop = () => { voiceRef.current?.stop(); voiceRef.current = null; setPlaying(false); };

  const onKeyDown = (e) => {
    // Ctrl+Enter: arkadaşlara çal (yazarken hızlıca göndermek için)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run('friends'); }
  };

  const noVoices = voices && !voices.length;
  const disabled = !text.trim() || !!busy || !voices || noVoices;
  const sliderRow = (label, key, min, max, value) => (
    <label className="flex items-center gap-3 text-xs font-mono" style={{ color: '#8e9c8b' }}>
      <span className="w-10 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step="0.05" value={value}
        onChange={(e) => setPrefs({ [key]: parseFloat(e.target.value) })}
        className="flex-1 volume-slider" aria-label={label}
      />
      <span className="w-10 text-right tabular-nums">{Math.round(value * 100)}%</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 modal-backdrop bg-black/50" onClick={closeTts} />
      <div className="w-96 max-w-full border-l border-app-border flex flex-col h-full shadow-2xl fade-in overflow-hidden" style={{ background: '#0d0f0d' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] font-mono" style={{ color: 'var(--accent)' }}>SESLENDİR</h2>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: '#5c665a' }}>Yaz, Pado okusun · internet gerekmez</p>
          </div>
          <button onClick={closeTts} aria-label="Kapat" className="w-7 h-7 flex items-center justify-center text-[#5c665a] hover:text-white hover:bg-app-surface transition-colors text-xs">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="space-y-1">
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={onKeyDown}
              rows={5}
              placeholder="Arkadaşlarına ne söylensin?"
              aria-label="Seslendirilecek metin"
              className="w-full bg-app-input border border-app-border px-3 py-2 text-sm text-white outline-none focus-lime font-mono placeholder-[#3c4238] resize-none"
            />
            <p className="text-[10px] font-mono text-right" style={{ color: '#3c4238' }}>{text.length} / {MAX_CHARS} · Ctrl+Enter ile çal</p>
          </div>

          <div className="p-3 bg-app-surface border border-app-border space-y-2.5">
            <label className="flex items-center gap-3 text-xs font-mono" style={{ color: '#8e9c8b' }}>
              <span className="w-10 shrink-0">Ses</span>
              <select
                value={voiceId}
                onChange={(e) => setPrefs({ voiceId: e.target.value })}
                disabled={!voices?.length}
                className="flex-1 min-w-0 bg-app-input border border-app-border px-2 py-1 text-xs text-white outline-none font-mono"
              >
                {!voices && <option>Yükleniyor…</option>}
                {noVoices && <option>Ses bulunamadı</option>}
                {voices?.map((v) => <option key={v.id} value={v.id}>{v.name}{v.lang ? ` (${v.lang})` : ''}</option>)}
              </select>
            </label>
            {sliderRow('Hız', 'rate', 0.5, 2, prefs.rate)}
            {sliderRow('Ton', 'pitch', 0.5, 1.5, prefs.pitch)}
            {hint && <p className="text-[10px] font-mono" style={{ color: '#d4a017' }}>{hint}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => run('friends')} disabled={disabled}
              className="col-span-2 btn-accent py-2 text-xs font-bold font-mono tracking-wider disabled:opacity-40"
              title="Hoparlörden ve sanal kablodan (Discord, oyun) çalar"
            >
              {busy === 'friends' ? 'HAZIRLANIYOR…' : 'ARKADAŞLARA ÇAL'}
            </button>
            <button
              onClick={() => run('local')} disabled={disabled}
              className="py-2 bg-app-raised border border-app-border hover:border-[rgba(196,255,0,0.3)] text-[#8e9c8b] hover:text-[#c4ff00] text-xs font-bold font-mono tracking-wider transition-colors disabled:opacity-40"
              title="Yalnızca senin hoparlöründen"
            >
              {busy === 'local' ? '…' : 'KENDİM DİNLE'}
            </button>
            <button
              onClick={() => run('add')} disabled={disabled}
              className="py-2 bg-app-raised border border-app-border hover:border-[rgba(196,255,0,0.3)] text-[#8e9c8b] hover:text-[#c4ff00] text-xs font-bold font-mono tracking-wider transition-colors disabled:opacity-40"
              title="Ses Ekle penceresinde açar; kırpıp butona kaydedebilirsin"
            >
              {busy === 'add' ? '…' : 'BUTONA EKLE'}
            </button>
            {playing && (
              <button onClick={stop} className="col-span-2 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 text-xs font-bold font-mono tracking-wider">
                DURDUR
              </button>
            )}
          </div>

          {error && <p role="alert" className="text-xs font-mono text-red-400 bg-red-900/10 p-2 border border-red-600/20">{error}</p>}

          {recent.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#5c665a' }}>Son söylenenler</p>
              {recent.map((r) => (
                <button
                  key={r} onClick={() => run('friends', r)} disabled={!!busy}
                  title="Tekrar arkadaşlara çal"
                  className="w-full text-left px-2 py-1.5 text-xs font-mono text-[#8e9c8b] hover:text-[#c4ff00] hover:bg-app-surface border border-app-border truncate"
                >
                  ▶ {r}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
