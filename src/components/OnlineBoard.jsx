import { useEffect, useState } from 'react';
import useOnlineStore, { SUGGESTIONS } from '../store/useOnlineStore';
import useSoundStore, { PRESET_COLORS } from '../store/useSoundStore';
import Pado from './Pado';

// Bekleme anı: Pado arıyor. Yazı gerçekten geçen süreye göre değişir (uydurma ilerleme yok):
// önce soruyoruz, sonra tarıyoruz, yavaşlarsa dürüstçe yavaş olduğunu söyler.
export function useElapsed(active) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!active) { setSec(0); return undefined; }
    const t0 = Date.now();
    setSec(0);
    const id = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [active]);
  return sec;
}

export function loadingLine(kind, sec, query) {
  if (kind === 'more') return sec < 8 ? 'Daha fazla ses getiriyorum…' : 'Servis biraz yavaş, hâlâ bekliyorum…';
  if (sec < 3) return `“${query}” için Openverse’e soruyorum…`;
  if (sec < 8) return 'Sesleri tarıyorum, sadece CC0 olanları ayırıyorum…';
  if (sec < 20) return 'Servis bugün biraz yavaş, hâlâ yanıt bekliyorum…';
  return 'Biraz uzadı. İnternetini kontrol edebilirsin, ben beklemeye devam ediyorum.';
}

function OnlineLoading({ kind, query }) {
  const sec = useElapsed(true);
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10" role="status" aria-live="polite">
      <Pado mood="searching" size={240} />
      <p className="text-sm font-mono text-center max-w-md" style={{ color: 'var(--accent)' }}>{loadingLine(kind, sec, query)}</p>
      <p className="text-[11px] font-mono" style={{ color: '#5c665a' }}>{sec} sn</p>
    </div>
  );
}

// Soundboard'un "Çevrimiçi sesler" görünümü: yerel butonların yerine Openverse'teki (CC0) sesler gelir.
// Butona basınca SADECE çalar (akış, diske yazılmaz). Köşedeki ↓ ile yerel kütüphaneye indirilir.

const colorOf = (id) => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESET_COLORS[h % PRESET_COLORS.length];
};

export const fmtDur = (ms) => {
  if (ms == null) return '';
  if (ms >= 60000) return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  return `${(ms / 1000).toFixed(1)} s`;
};

export function OnlinePad({ item }) {
  const playing = useOnlineStore((s) => s.playingId === item.id);
  const busy = useOnlineStore((s) => !!s.downloading[item.id]);
  const added = useOnlineStore((s) => !!s.added[item.id]);
  const toggle = useOnlineStore((s) => s.togglePreview);
  const add = useOnlineStore((s) => s.addToLibrary);
  const color = colorOf(item.id);

  return (
    <div className="relative group fade-in">
      <button
        type="button"
        onClick={() => toggle(item)}
        title={`${item.title}${item.creator ? ` — ${item.creator}` : ''}`}
        className={`relative w-full aspect-square flex flex-col items-center justify-center gap-1.5 overflow-hidden select-none transition-all duration-150 focus:outline-none ${playing ? 'playing-pulse' : 'hover:scale-[1.04] hover:brightness-110'}`}
        style={{
          backgroundColor: color,
          boxShadow: playing
            ? `0 0 24px ${color}70, 0 4px 16px rgba(0,0,0,0.6), inset 0 0 18px ${color}25`
            : '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/12 to-transparent pointer-events-none" />
        <div className="relative z-10 text-white">
          {playing ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          )}
        </div>
        <div className="relative z-10 text-sm font-bold px-2 text-center leading-tight line-clamp-2 max-w-full font-mono tracking-wide text-white">
          {item.title}
        </div>
        <span className="relative z-10 text-[10px] font-mono text-white/70">{fmtDur(item.durationMs)}</span>
      </button>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); add(item); }}
        disabled={busy || added}
        title={added ? 'Yerel kütüphanene eklendi' : 'Yerel kütüphaneye indir'}
        aria-label={added ? 'Eklendi' : `${item.title} indir`}
        className={`absolute top-1.5 right-1.5 z-20 w-8 h-8 flex items-center justify-center bg-black/65 backdrop-blur-sm text-white transition-opacity hover:bg-black/85 disabled:cursor-default ${busy || added ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
      >
        {busy ? (
          <span className="w-3.5 h-3.5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
        ) : added ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4ff00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></svg>
        )}
      </button>
    </div>
  );
}

export default function OnlineBoard() {
  const { query, results, loading, loadingKind, error, quota, searched, hasMore, total, search, loadMore, stop } = useOnlineStore();
  const cols = useSoundStore((s) => Math.min(20, Math.max(1, s.settings.gridColumns || 5)));
  const [text, setText] = useState(query);

  useEffect(() => {
    if (!searched) search('sound effect');
    return () => stop(); // görünümden çıkınca çalan önizleme dursun
  }, []);

  const submit = (e) => { e.preventDefault(); search(text); };
  const pick = (w) => { setText(w); search(w); };

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] font-mono" style={{ color: 'var(--accent)' }}>ÇEVRİMİÇİ SESLER</h2>
          <p className="text-[11px] font-mono mt-1" style={{ color: '#5c665a' }}>
            Openverse · yalnızca CC0 (atıf gerekmez). Butona basınca <strong className="text-[#8e9c8b]">sadece çalar</strong>, köşedeki ↓ ile yerel kütüphanene indirirsin.
          </p>
        </div>
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={text} onChange={(e) => setText(e.target.value)} placeholder="Ses ara: airhorn, rain..." aria-label="Çevrimiçi ses ara"
            className="w-64 bg-app-input border border-app-border px-3 py-1.5 text-sm text-white outline-none focus-lime font-mono placeholder-[#5c665a]"
          />
          <button type="submit" disabled={loading || !text.trim()} className="btn-accent px-4 py-1.5 text-xs font-bold font-mono tracking-wider disabled:opacity-50">ARA</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((w) => (
          <button
            key={w} type="button" onClick={() => pick(w)}
            className="px-2.5 py-1 text-[11px] font-mono bg-app-surface border border-app-border text-[#8e9c8b] hover:text-white hover:border-[rgba(196,255,0,0.3)] transition-colors"
          >
            {w}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono" style={{ color: '#5c665a' }}>
        {!loading && searched && !error && <span>{total} sonuç · “{query}”</span>}
        {quota && <span>Kalan arama: günde {quota.day ?? '?'} · dakikada {quota.minute ?? '?'}</span>}
      </div>

      {error && (
        <div className="p-3 border text-xs font-mono text-red-400" style={{ background: 'rgba(255,50,50,0.08)', borderColor: 'rgba(255,50,50,0.25)' }}>{error}</div>
      )}

      {searched && !loading && !error && results.length === 0 && (
        <p className="text-sm font-mono py-6" style={{ color: '#5c665a' }}>Bu aramada CC0 ses bulunamadı. Farklı bir kelime dene.</p>
      )}

      {loading && results.length === 0 && <OnlineLoading kind={loadingKind} query={query} />}

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {results.map((item) => <OnlinePad key={item.id} item={item} />)}
      </div>

      {loading && results.length > 0 && (
        <div className="flex items-center justify-center gap-3" role="status">
          <Pado mood="searching" size={96} />
          <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{loadingLine(loadingKind, 0, query)}</span>
        </div>
      )}

      {hasMore && (
        <button type="button" onClick={loadMore} disabled={loading} className="self-center px-5 py-2 text-xs font-bold font-mono tracking-wider bg-app-surface border border-app-border text-[#8e9c8b] hover:text-white disabled:opacity-50">
          {loading ? 'YÜKLENİYOR...' : 'DAHA FAZLA'}
        </button>
      )}
    </div>
  );
}
