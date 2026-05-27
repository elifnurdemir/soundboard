import { useState, useEffect } from 'react';
import useSoundStore from '../store/useSoundStore';
import useStreamStore from '../store/useStreamStore';

function WindowControls() {
  const [isMax, setIsMax] = useState(false);
  useEffect(() => { window.electronAPI?.isMaximized().then(setIsMax); }, []);
  const handleMax = async () => {
    await window.electronAPI?.maximize();
    setIsMax(await window.electronAPI?.isMaximized());
  };
  return (
    <div className="flex items-center gap-0.5 titlebar-no-drag">
      <button onClick={() => window.electronAPI?.minimize()} className="w-8 h-8 flex items-center justify-center text-[#5c665a] hover:text-white hover:bg-[#1a1e1a] transition-colors">
        <svg width="9" height="2" viewBox="0 0 9 2" fill="currentColor"><rect width="9" height="1.5" rx="0.75"/></svg>
      </button>
      <button onClick={handleMax} className="w-8 h-8 flex items-center justify-center text-[#5c665a] hover:text-white hover:bg-[#1a1e1a] transition-colors">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.25">
          <rect x="0.625" y="0.625" width="7.75" height="7.75"/>
        </svg>
      </button>
      <button onClick={() => window.electronAPI?.close()} className="w-8 h-8 flex items-center justify-center text-[#5c665a] hover:text-white hover:bg-red-600 transition-colors">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="1" y1="1" x2="8" y2="8"/><line x1="8" y1="1" x2="1" y2="8"/>
        </svg>
      </button>
    </div>
  );
}

export default function Header() {
  const {
    openAddModal, openSettings, stopAllSounds, playingSounds,
    openVoiceChat, openStream, setSearchQuery, searchQuery,
  } = useSoundStore();
  const { twitchConnected, obsConnected } = useStreamStore();
  const playingCount = Object.keys(playingSounds).length;

  return (
    <header className="titlebar-drag flex items-center gap-2 px-3 py-2 bg-app-bg border-b border-app-border select-none z-10 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 titlebar-no-drag shrink-0">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <rect width="26" height="26" fill="#0b0d0b"/>
          {/* 3x3 pad grid */}
          {[0,1,2].map(row => [0,1,2].map(col => {
            const x = 2 + col * 8, y = 2 + row * 8;
            const isLime = row === col;
            const isMed = (row === 0 && col === 1) || (row === 1 && col === 2) || (row === 2 && col === 0);
            return (
              <rect key={`${row}-${col}`} x={x} y={y} width="6" height="6" rx="1"
                fill={isLime ? '#c4ff00' : isMed ? '#2a5a2a' : '#1a2a1a'}
              />
            );
          }))}
        </svg>
        <span className="font-bold text-white text-sm tracking-widest uppercase font-mono">SOUNDBOARD</span>
      </div>

      {/* Search */}
      <div className="titlebar-no-drag flex-1 max-w-xs">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#5c665a' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Ses ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-app-input border border-app-border rounded-none pl-8 pr-3 py-1.5 text-sm text-white placeholder-[#5c665a] outline-none focus-lime transition-colors font-mono"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5c665a] hover:text-white text-xs">✕</button>
          )}
        </div>
      </div>

      {/* Playing indicator */}
      {playingCount > 0 && (
        <div className="titlebar-no-drag flex items-center gap-1.5 px-3 py-1 border font-mono text-xs" style={{ borderColor: 'rgba(196,255,0,0.3)', color: 'var(--accent)', background: 'rgba(196,255,0,0.06)' }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--accent)' }}/>
            <span className="relative rounded-full h-1.5 w-1.5" style={{ background: 'var(--accent)' }}/>
          </span>
          {playingCount} ÇALIYOR
        </div>
      )}

      {/* Right actions */}
      <div className="flex items-center gap-1 titlebar-no-drag ml-auto">
        {/* STOP ALL */}
        <button
          onClick={stopAllSounds}
          disabled={playingCount === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold font-mono tracking-wider transition-all ${
            playingCount > 0
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-app-surface text-[#5c665a] cursor-not-allowed'
          }`}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18"/></svg>
          DURDUR
        </button>

        {/* Voice Chat */}
        <button
          onClick={openVoiceChat}
          className="w-8 h-8 flex items-center justify-center text-[#5c665a] hover:text-[#c4ff00] hover:bg-app-surface transition-colors"
          title="Ses Yönlendirme"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>

        {/* Stream */}
        <button
          onClick={openStream}
          className="w-8 h-8 flex items-center justify-center hover:bg-app-surface transition-colors relative"
          title="Stream Entegrasyonu"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={twitchConnected || obsConnected ? 'var(--accent)' : '#5c665a'} stroke="none">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
          </svg>
          {(twitchConnected || obsConnected) && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }}/>
          )}
        </button>

        {/* Add Sound */}
        <button
          onClick={() => openAddModal()}
          className="btn-accent flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold font-mono tracking-wider"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          SES EKLE
        </button>

        {/* Settings */}
        <button onClick={openSettings} className="w-8 h-8 flex items-center justify-center text-[#5c665a] hover:text-[#c4ff00] hover:bg-app-surface transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        <WindowControls />
      </div>
    </header>
  );
}
