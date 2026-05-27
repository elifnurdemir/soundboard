import { useState, useEffect } from 'react';

export default function UpdateBanner() {
  const [state, setState] = useState('idle'); // idle | available | downloading | ready
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateAvailable((info) => {
      setVersion(info.version);
      setState('available');
    });

    window.electronAPI.onUpdateProgress((p) => {
      setProgress(Math.round(p.percent));
      setState('downloading');
    });

    window.electronAPI.onUpdateDownloaded(() => {
      setState('ready');
    });
  }, []);

  if (state === 'idle') return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 border border-app-border shadow-2xl fade-in overflow-hidden" style={{ background: '#141714' }}>
      <div className="h-0.5 w-full" style={{ background: 'var(--accent)' }} />
      <div className="p-4 space-y-3">

        {state === 'available' && (
          <>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 shrink-0 flex items-center justify-center" style={{ background: 'rgba(196,255,0,0.1)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4ff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  <path d="M5 20h14"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-white font-mono">Güncelleme Mevcut</p>
                <p className="text-xs font-mono mt-0.5" style={{ color: '#5c665a' }}>v{version} hazır</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setState('idle')}
                className="flex-1 py-1.5 text-xs font-bold font-mono bg-app-raised border border-app-border hover:border-[rgba(196,255,0,0.2)] text-[#5c665a] hover:text-white transition-colors"
              >
                SONRA
              </button>
              <button
                onClick={() => { window.electronAPI.downloadUpdate(); setState('downloading'); }}
                className="flex-1 py-1.5 text-xs font-bold font-mono btn-accent"
              >
                İNDİR
              </button>
            </div>
          </>
        )}

        {state === 'downloading' && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 shrink-0 flex items-center justify-center" style={{ background: 'rgba(196,255,0,0.1)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4ff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white font-mono">İndiriliyor...</p>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--accent)' }}>{progress}%</p>
              </div>
            </div>
            <div className="w-full h-1 bg-app-raised rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${progress}%`, background: 'var(--accent)' }}
              />
            </div>
          </>
        )}

        {state === 'ready' && (
          <>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 shrink-0 flex items-center justify-center" style={{ background: 'rgba(196,255,0,0.15)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#c4ff00">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-white font-mono">Güncelleme Hazır</p>
                <p className="text-xs font-mono mt-0.5" style={{ color: '#5c665a' }}>Uygulamayı yeniden başlatarak kur</p>
              </div>
            </div>
            <button
              onClick={() => window.electronAPI.installUpdate()}
              className="w-full py-2 text-xs font-bold font-mono btn-accent"
            >
              YENİDEN BAŞLAT VE KUR
            </button>
          </>
        )}

      </div>
    </div>
  );
}
