import { useState, useRef, useEffect, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useSoundStore, { adaptColorForTheme } from '../store/useSoundStore';

function PlayingBars() {
  return (
    <div className="flex items-end gap-[3px] h-7">
      {[1,2,3,4,5].map(i => (
        <div key={i} className={`w-[3px] bg-current rounded-sm eq-bar-${i}`} style={{ height: '4px' }} />
      ))}
    </div>
  );
}

// Cooldown ring
function CooldownRing({ progress, color }) {
  if (progress >= 1) return null;
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - progress);
  return (
    <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="5"/>
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SoundButton({ sound }) {
  const {
    playSound, stopSoundWithFade, playingSounds,
    updateSound, openAddModal, deleteSound, getCooldownProgress,
    settings,
  } = useSoundStore();

  const displayColor = adaptColorForTheme(sound.color, settings.theme);

  const isPlaying = !!(playingSounds[sound.id]?.length);
  const instanceCount = playingSounds[sound.id]?.length || 0;
  const [showControls, setShowControls] = useState(false);
  const [cooldown, setCooldown] = useState(1);
  const hoverTimer = useRef(null);
  const cdTimer = useRef(null);

  // Cooldown progress refresh
  useEffect(() => {
    if (!sound.cooldown) return;
    cdTimer.current = setInterval(() => {
      const p = getCooldownProgress(sound.id);
      setCooldown(p);
      if (p >= 1) clearInterval(cdTimer.current);
    }, 100);
    return () => clearInterval(cdTimer.current);
  }, [sound.id, sound.cooldown, getCooldownProgress]);

  useEffect(() => {
    if (sound.cooldown) {
      setCooldown(getCooldownProgress(sound.id));
      clearInterval(cdTimer.current);
      cdTimer.current = setInterval(() => {
        const p = getCooldownProgress(sound.id);
        setCooldown(p);
        if (p >= 1) clearInterval(cdTimer.current);
      }, 100);
    }
    return () => clearInterval(cdTimer.current);
  }, [playingSounds[sound.id]]);

  // DnD
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sound.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const handleClick = (e) => {
    if (e.target.closest('.no-play')) return;
    if (isPlaying) stopSoundWithFade(sound.id, sound);
    else playSound(sound);
  };

  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value);
    updateSound(sound.id, { volume: vol });
    const instances = playingSounds[sound.id] || [];
    const gv = useSoundStore.getState().settings.globalVolume ?? 1;
    instances.forEach(({ audio }) => { audio.volume = Math.min(1, vol * gv); });
  };

  const { r, g, b } = hexToRgb(displayColor || '#c4ff00');
  const bright = (r * 299 + g * 587 + b * 114) / 1000;
  const textColor = bright > 140 ? 'text-black/80' : 'text-white';
  const isOnCooldown = sound.cooldown > 0 && cooldown < 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative fade-in"
      onMouseEnter={() => { hoverTimer.current = setTimeout(() => setShowControls(true), 150); }}
      onMouseLeave={() => { clearTimeout(hoverTimer.current); setShowControls(false); }}
    >

      {/* Drag handle */}
      {showControls && (
        <div
          {...attributes} {...listeners}
          className="no-play absolute top-1 left-1 z-30 w-5 h-5 flex items-center justify-center text-white/30 hover:text-white/70 cursor-grab active:cursor-grabbing"
          title="Sürükle"
        >
          <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/>
            <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
            <circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/>
          </svg>
        </div>
      )}

      <button
        onClick={handleClick}
        disabled={isOnCooldown && !isPlaying}
        className={`
          relative w-full aspect-square flex flex-col items-center justify-center
          gap-1.5 overflow-hidden transition-all duration-150 select-none
          ${isPlaying ? 'playing-pulse' : isOnCooldown ? 'opacity-60 cursor-not-allowed' : 'hover:scale-[1.04] hover:brightness-110'}
          focus:outline-none
        `}
        style={{
          backgroundColor: (sound.image && sound.noColor) ? '#0b0d0b' : displayColor,
          backgroundImage: sound.image ? `url("soundboard:///${sound.image.replace(/\\/g, '/').replace(/ /g, '%20')}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          boxShadow: isPlaying
            ? `0 0 24px ${displayColor}70, 0 4px 16px rgba(0,0,0,0.6), inset 0 0 18px ${displayColor}25, inset 0 1px 0 rgba(255,255,255,0.2)`
            : '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
        title={`${sound.name}${sound.shortcut ? ` [${sound.shortcut}]` : ''}`}
      >
        {/* Image color overlay — keeps text readable */}
        {sound.image && !sound.noColor && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: `${displayColor}99` }}/>
        )}
        {/* Shine overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/12 to-transparent pointer-events-none"/>
        {/* Sonar circles — contained by button's overflow:hidden */}
        {isPlaying && (
          <>
            <div className="playing-inner-sonar-1" style={{ background: `${displayColor}55` }}/>
            <div className="playing-inner-sonar-2" style={{ background: `${displayColor}40` }}/>
            <div className="playing-inner-sonar-3" style={{ background: `${displayColor}30` }}/>
            {/* scan line */}
            <div className="playing-scan absolute top-0 bottom-0 w-1/3 pointer-events-none z-10"
              style={{ background: `linear-gradient(to right, transparent, ${displayColor}45, transparent)` }}
            />
          </>
        )}

        {/* Cooldown ring */}
        {isOnCooldown && <CooldownRing progress={cooldown} color="rgba(255,255,255,0.6)"/>}

        {/* Icon */}
        <div className={`relative z-10 ${textColor}`} style={{ fontSize: 0 }}>
          {isPlaying ? <PlayingBars /> : (
            <svg style={{ width: 'clamp(10px, 30%, 22px)', height: 'clamp(10px, 30%, 22px)' }} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          )}
        </div>

        {/* Name */}
        <div
          className={`relative z-10 font-bold text-center leading-tight line-clamp-2 max-w-full font-mono tracking-wide px-[8%] ${sound.image && sound.noColor ? 'text-white' : textColor}`}
          style={{
            fontSize: 'clamp(7px, 12%, 13px)',
            ...(sound.image && sound.noColor ? { textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)' } : {}),
          }}
        >
          {sound.name}
        </div>

        {/* Badges */}
        <div className="relative z-10 flex items-center gap-[3%] flex-wrap justify-center px-[5%]"
          style={{ fontSize: 'clamp(6px, 9%, 9px)' }}
        >
          {sound.shortcut && (
            <span className={`px-[6%] py-[2%] bg-black/30 ${textColor} font-mono tracking-wider`}>{sound.shortcut}</span>
          )}
          {sound.loop && (
            <span className={`px-[4%] py-[2%] bg-black/30 ${textColor}`}>↺</span>
          )}
          {sound.overlap && instanceCount > 1 && (
            <span className={`px-[6%] py-[2%] bg-black/30 ${textColor} font-bold font-mono`}>×{instanceCount}</span>
          )}
          {isOnCooldown && (
            <span className={`px-[6%] py-[2%] bg-black/40 ${textColor} font-mono`}>
              {(sound.cooldown * (1 - cooldown)).toFixed(1)}s
            </span>
          )}
        </div>

        {/* Volume slider on hover */}
        {showControls && (
          <div
            className="no-play absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm"
            style={{ padding: 'clamp(2px, 4%, 6px) clamp(3px, 5%, 8px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1">
              <svg style={{ width: 'clamp(6px, 10%, 9px)', height: 'clamp(6px, 10%, 9px)', flexShrink: 0 }} viewBox="0 0 24 24" fill="white" opacity="0.6">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
              <input
                type="range" min="0" max="1" step="0.02"
                value={sound.volume ?? 0.8}
                onChange={handleVolumeChange}
                className="no-play flex-1 volume-slider min-w-0"
              />
            </div>
          </div>
        )}
      </button>

      {/* Edit/Delete */}
      {showControls && (
        <div className="no-play absolute top-[4%] right-[4%] flex gap-[3%] z-30"
          style={{ '--btn': 'clamp(18px, 28%, 32px)' }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); openAddModal(sound); }}
            className="flex items-center justify-center bg-black/60 hover:bg-black/85 backdrop-blur-sm text-white/80 hover:text-white transition-colors"
            style={{ width: 'var(--btn)', height: 'var(--btn)' }}
          >
            <svg style={{ width: 'clamp(8px, 45%, 14px)', height: 'clamp(8px, 45%, 14px)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); deleteSound(sound.id); }}
            className="flex items-center justify-center bg-black/60 hover:bg-red-600/80 backdrop-blur-sm text-white/80 hover:text-white transition-colors"
            style={{ width: 'var(--btn)', height: 'var(--btn)' }}
          >
            <svg style={{ width: 'clamp(8px, 45%, 14px)', height: 'clamp(8px, 45%, 14px)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
