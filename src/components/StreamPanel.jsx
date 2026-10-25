import { useState, useEffect } from 'react';
import useStreamStore from '../store/useStreamStore';
import useSoundStore from '../store/useSoundStore';

function Section({ title, icon, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-app-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-app-surface text-left hover:bg-app-raised transition-colors"
      >
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-bold font-mono tracking-wider text-white flex-1 uppercase">{title}</span>
        <span className="text-[10px] font-mono" style={{ color: '#5c665a' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4 space-y-3" style={{ background: '#0d0f0d' }}>{children}</div>}
    </div>
  );
}

export default function StreamPanel() {
  const { closeStream } = useSoundStore();
  const {
    twitchChannel, twitchConnected, twitchError,
    connectTwitch, disconnectTwitch,
    obsHost, obsPort, obsPassword, obsConnected, obsError,
    connectOBS, disconnectOBS,
    hotkeyProfiles, activeProfileId, addProfile, deleteProfile, setActiveProfile,
  } = useStreamStore();

  const [twCh, setTwCh] = useState(twitchChannel);
  const [obsH, setObsH] = useState(obsHost);
  const [obsP, setObsP] = useState(String(obsPort));
  const [obsPw, setObsPw] = useState(obsPassword);
  const [newProfile, setNewProfile] = useState('');

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') closeStream(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const inputCls = "w-full bg-app-input border border-app-border px-3 py-1.5 text-sm text-white outline-none focus-lime font-mono placeholder-[#3c4238]";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 modal-backdrop bg-black/50" onClick={closeStream}/>
      <div className="w-96 border-l border-app-border flex flex-col h-full shadow-2xl fade-in overflow-hidden" style={{ background: '#0d0f0d' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] font-mono" style={{ color: 'var(--accent)' }}>STREAM ENTEGRASYONU</h2>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: '#5c665a' }}>OBS · Twitch · Hotkey Profilleri</p>
          </div>
          <button onClick={closeStream} className="w-7 h-7 flex items-center justify-center text-[#5c665a] hover:text-white hover:bg-app-surface transition-colors text-xs">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Twitch */}
          <Section title="Twitch Chat" icon="🎮">
            <p className="text-xs font-mono" style={{ color: '#8e9c8b' }}>
              Seslere <strong className="text-white">Chat Komutu</strong> ekleyince izleyiciler{' '}
              <code className="font-mono" style={{ color: 'var(--accent)' }}>!komut</code> yazarak sesi çaldırabilir.
            </p>
            <div className="flex gap-2">
              <input
                value={twCh}
                onChange={(e) => setTwCh(e.target.value)}
                placeholder="Twitch kanal adı"
                className={inputCls}
              />
              <button
                onClick={() => twitchConnected ? disconnectTwitch() : connectTwitch(twCh)}
                disabled={!twCh.trim() && !twitchConnected}
                className={`px-3 py-1.5 text-xs font-bold font-mono tracking-wider transition-colors ${
                  twitchConnected
                    ? 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30'
                    : 'btn-accent'
                }`}
              >
                {twitchConnected ? 'KES' : 'BAĞLAN'}
              </button>
            </div>
            {twitchConnected && (
              <div className="flex items-center gap-2 p-2 border" style={{ background: 'rgba(196,255,0,0.05)', borderColor: 'rgba(196,255,0,0.2)' }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute h-full w-full rounded-full opacity-75" style={{ background: 'var(--accent)' }}/>
                  <span className="relative rounded-full h-1.5 w-1.5" style={{ background: 'var(--accent)' }}/>
                </span>
                <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>#{twitchChannel} — bağlandı</p>
              </div>
            )}
            {twitchError && <p className="text-xs font-mono text-red-400 bg-red-900/10 p-2 border border-red-600/20">{twitchError}</p>}
            <p className="text-[10px] font-mono" style={{ color: '#3c4238' }}>
              Ses ayarında "Chat Komutu" alanını doldurun (örn: <code>selam</code> → !selam)
            </p>
          </Section>

          {/* OBS */}
          <Section title="OBS WebSocket" icon="🎬">
            <p className="text-xs font-mono" style={{ color: '#8e9c8b' }}>
              OBS 28+ ile gelir. Tools → WebSocket Server Settings'den etkinleştirin.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-[10px] font-mono uppercase tracking-wider mb-1 block" style={{ color: '#5c665a' }}>Host</label>
                <input value={obsH} onChange={(e) => setObsH(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider mb-1 block" style={{ color: '#5c665a' }}>Port</label>
                <input value={obsP} onChange={(e) => setObsP(e.target.value)} className={inputCls} />
              </div>
            </div>
            <input
              type="password"
              value={obsPw}
              onChange={(e) => setObsPw(e.target.value)}
              placeholder="Şifre (opsiyonel)"
              className={inputCls}
            />
            <button
              onClick={() => obsConnected ? disconnectOBS() : connectOBS(obsH, parseInt(obsP) || 4455, obsPw)}
              className={`w-full py-2 text-xs font-bold font-mono tracking-wider transition-colors ${
                obsConnected
                  ? 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30'
                  : 'btn-accent'
              }`}
            >
              {obsConnected ? '⬛ BAĞLANTIYI KES' : '▶ OBS\'E BAĞLAN'}
            </button>
            {obsConnected && (
              <div className="flex items-center gap-2 p-2 border" style={{ background: 'rgba(0,255,128,0.05)', borderColor: 'rgba(0,255,128,0.2)' }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75"/>
                  <span className="relative rounded-full h-1.5 w-1.5 bg-green-400"/>
                </span>
                <p className="text-xs font-mono text-green-400">OBS bağlandı — {obsH}:{obsP}</p>
              </div>
            )}
            {obsError && <p className="text-xs font-mono text-red-400 bg-red-900/10 p-2 border border-red-600/20">{obsError}</p>}
          </Section>

          {/* Hotkey Profiles */}
          <Section title="Hotkey Profilleri" icon="⌨️">
            <p className="text-xs font-mono" style={{ color: '#8e9c8b' }}>Farklı yayınlar için farklı kısayol setleri.</p>
            <div className="space-y-1">
              {hotkeyProfiles.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border ${
                    activeProfileId === p.id
                      ? 'bg-[rgba(196,255,0,0.06)]'
                      : 'bg-app-surface border-app-border hover:bg-app-raised'
                  }`}
                  style={activeProfileId === p.id ? { borderColor: 'rgba(196,255,0,0.25)' } : {}}
                  onClick={() => setActiveProfile(p.id)}
                >
                  <div className="w-1.5 h-1.5" style={{ background: activeProfileId === p.id ? 'var(--accent)' : '#3c4238' }}/>
                  <span className="text-sm font-mono text-white flex-1">{p.name}</span>
                  {activeProfileId === p.id && (
                    <span className="text-[10px] font-bold font-mono" style={{ color: 'var(--accent)' }}>AKTİF</span>
                  )}
                  {p.id !== 'default' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }}
                      className="text-[#5c665a] hover:text-red-400 text-xs ml-1"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); if (newProfile.trim()) { addProfile(newProfile.trim()); setNewProfile(''); }}}
              className="flex gap-2"
            >
              <input
                value={newProfile}
                onChange={(e) => setNewProfile(e.target.value)}
                placeholder="Yeni profil adı..."
                className={`flex-1 ${inputCls}`}
              />
              <button type="submit" className="btn-accent px-3 py-1.5 text-sm font-bold font-mono">+</button>
            </form>
          </Section>
        </div>
      </div>
    </div>
  );
}
