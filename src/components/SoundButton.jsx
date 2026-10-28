import { useState, useRef, useEffect, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useSoundStore, { adaptColorForTheme } from '../store/useSoundStore';
import ContextMenu from './ContextMenu';
import { SokakWall, SprayTitle } from './sokak';

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

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;

// sokak: Sokak konsepti için { color, rot, dx, dy } (SoundGrid, ızgara sırasına göre atar)
export default function SoundButton({ sound, sokak }) {
  const {
    playSound, stopSoundWithFade, playingSounds,
    updateSound, openAddModal, deleteSound, getCooldownProgress,
    toggleFavorite, settings, categories, askConfirm, permanentlyDeleteSound,
  } = useSoundStore();

  const isSokak = settings.buttonConcept === 'sokak' && !!sokak;
  const displayColor = isSokak ? sokak.color : adaptColorForTheme(sound.color, settings.theme);
  const [menu, setMenu] = useState(null); // sağ tık menüsü konumu { x, y }

  const isPlaying = !!(playingSounds[sound.id]?.length);
  const instanceCount = playingSounds[sound.id]?.length || 0;
  const [showControls, setShowControls] = useState(false);
  const [imageOver, setImageOver] = useState(false);
  // Buton genişliğine göre kontrol boyutu: full ≥120px, sm 70–119px, xs <70px
  const wrapRef = useRef(null);
  const [level, setLevel] = useState('full');
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setLevel(w >= 120 ? 'full' : w >= 70 ? 'sm' : 'xs');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ctrlBtn = level === 'full' ? 'w-8 h-8' : level === 'sm' ? 'w-6 h-6' : 'w-5 h-5';
  const ctrlIcon = level === 'full' ? 14 : level === 'sm' ? 11 : 9;
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

  // Görsel sürükle-bırak: butonun arka planı olur (GIF dahil — CSS background animasyonu oynatır).
  // Ses/video dosyası ise burada tüketmeyip global handler'a bırakıyoruz ("Ses Ekle" paneli açılır).
  const dragHasImage = (e) => {
    const item = Array.from(e.dataTransfer?.items || []).find((i) => i.kind === 'file');
    return !!item && /^image\//.test(item.type);
  };

  const handleImageDragOver = (e) => {
    if (!dragHasImage(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setImageOver(true);
  };

  const handleImageDrop = async (e) => {
    setImageOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file || !IMAGE_RE.test(file.name)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!window.electronAPI || !file.path) return;
    const res = await window.electronAPI.copyImageFile(file.path, true); // true = orijinali silme
    if (res?.success) updateSound(sound.id, { image: res.destPath, noColor: true });
  };

  const handleClick = (e) => {
    if (e.target.closest('.no-play')) return;
    if (isPlaying) stopSoundWithFade(sound.id, sound);
    else playSound(sound);
  };

  const menuItems = [
    { label: isPlaying ? 'Durdur' : 'Çal', onClick: () => (isPlaying ? stopSoundWithFade(sound.id, sound) : playSound(sound)) },
    { label: 'Düzenle', onClick: () => openAddModal(sound) },
    { label: sound.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle', onClick: () => toggleFavorite(sound.id) },
    { separator: true },
    { header: 'Kategoriye taşı' },
    ...categories.map((c) => ({
      label: c.name,
      checked: c.id === sound.categoryId,
      disabled: c.id === sound.categoryId,
      onClick: () => updateSound(sound.id, { categoryId: c.id }),
    })),
    { separator: true },
    { label: 'Çöp kutusuna taşı', onClick: () => deleteSound(sound.id) },
    {
      label: 'Dosyasıyla birlikte kalıcı sil…',
      danger: true,
      onClick: () => askConfirm({
        title: 'Kalıcı sil',
        message: `"${sound.name}" ve ses dosyası diskten silinecek. Bu işlem geri alınamaz.\n\nGeri alınabilir silme için "Çöp kutusuna taşı"yı kullan.`,
        confirmLabel: 'KALICI SİL',
        danger: true,
        onConfirm: () => permanentlyDeleteSound(sound.id),
      }),
    },
  ];

  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value);
    updateSound(sound.id, { volume: vol });
    const instances = playingSounds[sound.id] || [];
    const gv = useSoundStore.getState().settings.globalVolume ?? 1;
    instances.forEach(({ voice }) => voice.setVolume(Math.min(1, vol * gv)));
  };

  const { r, g, b } = hexToRgb(displayColor || '#c4ff00');
  const bright = (r * 299 + g * 587 + b * 114) / 1000;
  const textColor = isSokak || bright <= 140 ? 'text-white' : 'text-black/80'; // Sokak zemini koyu tuğla
  const isOnCooldown = sound.cooldown > 0 && cooldown < 1;

  return (
    <div
      ref={(el) => { setNodeRef(el); wrapRef.current = el; }}
      style={style}
      className="relative fade-in"
      onMouseEnter={() => { hoverTimer.current = setTimeout(() => setShowControls(true), 150); }}
      onMouseLeave={() => { clearTimeout(hoverTimer.current); setShowControls(false); }}
      onDragOver={handleImageDragOver}
      onDragLeave={() => setImageOver(false)}
      onDrop={handleImageDrop}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

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
          ${isSokak ? 'sokak-btn' : ''}
          ${imageOver ? 'ring-2 ring-white scale-[1.06]' : ''}
        `}
        style={{
          backgroundColor: isSokak ? '#2a130e' : (sound.image && sound.noColor) ? '#0b0d0b' : displayColor,
          backgroundImage: sound.image ? `url("soundboard:///${sound.image.replace(/\\/g, '/').replace(/ /g, '%20')}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          boxShadow: isPlaying
            ? `0 0 24px ${displayColor}70, 0 4px 16px rgba(0,0,0,0.6), inset 0 0 18px ${displayColor}25, inset 0 1px 0 rgba(255,255,255,0.2)`
            : '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
        title={`${sound.name}${sound.shortcut ? ` [${sound.shortcut}]` : ''}`}
      >
        {/* Sokak: görsel yoksa tuğla duvar, varsa görselin üstüne koyu perde (başlık okunsun) */}
        {isSokak && (sound.image
          ? <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.35)' }}/>
          : <SokakWall dx={sokak.dx} dy={sokak.dy} />)}
        {/* Image color overlay — keeps text readable */}
        {!isSokak && sound.image && !sound.noColor && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: `${displayColor}99` }}/>
        )}
        {/* Shine overlay */}
        {!isSokak && <div className="absolute inset-0 bg-gradient-to-br from-white/12 to-transparent pointer-events-none"/>}
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

        {isSokak ? (
          <>
            {/* Sokak: başlık boyanmış, çalarken köşede ses çubukları */}
            <SprayTitle text={sound.name} color={sokak.color} rot={sokak.rot} />
            {isPlaying && <div className="absolute top-1.5 right-1.5 z-10 text-white"><PlayingBars /></div>}
          </>
        ) : (
          <>
            {/* Icon */}
            <div className={`relative z-10 ${textColor}`}>
              {isPlaying ? <PlayingBars /> : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </div>

            {/* Name */}
            <div
              className={`relative z-10 text-sm font-bold px-2 text-center leading-tight line-clamp-2 max-w-full font-mono tracking-wide ${sound.image && sound.noColor ? 'text-white' : textColor}`}
              style={sound.image && sound.noColor ? { textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)' } : {}}
            >
              {sound.name}
            </div>
          </>
        )}

        {/* Badges */}
        <div className={`z-10 flex items-center gap-1 flex-wrap justify-center ${isSokak ? 'absolute bottom-1.5 left-0 right-0' : 'relative'}`}>
          {sound.shortcut && (
            <span className={`text-[9px] px-1.5 py-0.5 bg-black/30 ${textColor} font-mono tracking-wider`}>{sound.shortcut}</span>
          )}
          {sound.loop && (
            <span className={`text-[9px] px-1 py-0.5 bg-black/30 ${textColor}`}>↺</span>
          )}
          {sound.favorite && (
            <span className="text-[9px] px-1 py-0.5 bg-black/30">⭐</span>
          )}
          {sound.overlap && instanceCount > 1 && (
            <span className={`text-[9px] px-1.5 py-0.5 bg-black/30 ${textColor} font-bold font-mono`}>×{instanceCount}</span>
          )}
          {isOnCooldown && (
            <span className={`text-[9px] px-1.5 py-0.5 bg-black/40 ${textColor} font-mono`}>
              {(sound.cooldown * (1 - cooldown)).toFixed(1)}s
            </span>
          )}
        </div>

        {/* Volume slider on hover */}
        {showControls && (
          <div
            className={`no-play absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm ${level === 'full' ? 'px-2 py-1.5' : 'px-1 py-1'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {level === 'full' && <svg width="9" height="9" viewBox="0 0 24 24" fill="white" opacity="0.6">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>}
              <input
                type="range" min="0" max="1" step="0.02"
                value={sound.volume ?? 0.8}
                onChange={handleVolumeChange}
                className="no-play flex-1 min-w-0 volume-slider"
              />
              {level !== 'xs' && (
                <span className="text-white text-[9px] w-5 shrink-0 text-right opacity-60 font-mono">
                  {Math.round((sound.volume ?? 0.8) * 100)}
                </span>
              )}
            </div>
          </div>
        )}
      </button>

      {/* Edit/Delete */}
      {showControls && (
        <div className={`no-play absolute z-30 flex gap-1 ${level === 'xs' ? 'top-0.5 right-0.5 flex-col' : 'top-1.5 right-1.5'}`}>
          {level !== 'xs' && <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(sound.id); }}
            className={`${ctrlBtn} flex items-center justify-center bg-black/60 hover:bg-black/85 backdrop-blur-sm transition-colors ${sound.favorite ? 'text-yellow-400' : 'text-white/80 hover:text-white'}`}
            title={sound.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          >
            <svg width={ctrlIcon} height={ctrlIcon} viewBox="0 0 24 24" fill={sound.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>}
          <button
            onClick={(e) => { e.stopPropagation(); openAddModal(sound); }}
            className={`${ctrlBtn} flex items-center justify-center bg-black/60 hover:bg-black/85 backdrop-blur-sm text-white/80 hover:text-white transition-colors`}
            title="Düzenle"
          >
            <svg width={ctrlIcon} height={ctrlIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); deleteSound(sound.id); }}
            className={`${ctrlBtn} flex items-center justify-center bg-black/60 hover:bg-red-600/80 backdrop-blur-sm text-white/80 hover:text-white transition-colors`}
            title="Çöp kutusuna taşı (sağ tık: dosyasıyla sil)"
          >
            <svg width={ctrlIcon} height={ctrlIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
