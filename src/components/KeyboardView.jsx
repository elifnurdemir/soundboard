import { useMemo } from 'react';
import useSoundStore, { adaptColorForTheme } from '../store/useSoundStore';
import { LAYOUTS, getShortcutBaseKey, getShortcutMods } from '../data/keyboardLayouts';

const BASE_UNIT = 44; // px per 1u key at zoom 1
const GAP  = 4;
const ROW_GAP = 4;

function ModBadge({ label }) {
  return (
    <span className="text-[7px] font-mono px-0.5 rounded" style={{ background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4' }}>
      {label}
    </span>
  );
}

function Key({ k, sounds, onPlay, displayColor, UNIT }) {
  const w = k.w * UNIT + (k.w - 1) * GAP;

  if (k.gap) return <div style={{ width: k.w * UNIT, flexShrink: 0 }} />;

  const primary = sounds[0] ?? null;
  const extra = sounds.length - 1;
  const mods = primary ? getShortcutMods(primary.shortcut) : null;
  const bright = primary ? (() => {
    const hex = displayColor(primary).replace('#', '');
    const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
    return (r*299 + g*587 + b*114) / 1000;
  })() : 0;
  const textOnKey = bright > 140 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';

  return (
    <button
      onClick={() => primary && onPlay(primary)}
      disabled={!primary}
      title={primary ? `${primary.name}${primary.shortcut ? ` [${primary.shortcut}]` : ''}` : k.label}
      style={{
        width: w,
        height: UNIT,
        flexShrink: 0,
        background: primary ? displayColor(primary) : '#161a16',
        border: primary ? 'none' : '1px solid #1e231e',
        borderRadius: 4,
        position: 'relative',
        cursor: primary ? 'pointer' : 'default',
        transition: 'filter 0.1s',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { if (primary) e.currentTarget.style.filter = 'brightness(1.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
    >
      {primary ? (
        <>
          {/* Shine */}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)', pointerEvents:'none' }} />

          <div style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:2, padding:'3px 4px', color: textOnKey }}>
            {/* Modifier badges */}
            {mods && (mods.ctrl || mods.alt || mods.shift) && (
              <div style={{ display:'flex', gap:2 }}>
                {mods.ctrl  && <ModBadge label="Ctrl" />}
                {mods.alt   && <ModBadge label="Alt"  />}
                {mods.shift && <ModBadge label="Shift"/>}
              </div>
            )}
            {/* Sound name */}
            <span style={{ fontSize: w < 52 ? Math.max(6, UNIT*0.18) : w < 80 ? Math.max(7, UNIT*0.2) : Math.max(8, UNIT*0.24), fontWeight: 700, fontFamily:'monospace', textAlign:'center', lineHeight:1.2, wordBreak:'break-all', maxWidth:'100%', display:'-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {primary.name}
            </span>
            {/* Extra count */}
            {extra > 0 && (
              <span style={{ position:'absolute', top:2, right:3, fontSize:7, fontFamily:'monospace', background:'rgba(0,0,0,0.5)', color:'white', padding:'0 3px', borderRadius:2 }}>
                +{extra}
              </span>
            )}
          </div>
        </>
      ) : (
        <span style={{ fontSize: Math.max(7, UNIT * 0.2), color: '#2e352e', fontFamily:'monospace', fontWeight:600, userSelect:'none', letterSpacing:'0.03em' }}>
          {k.label}
        </span>
      )}
    </button>
  );
}

export default function KeyboardView() {
  const { sounds, settings, playSound, updateSettings } = useSoundStore();
  const layoutId = settings.keyboardLayout || '75';
  const layout = LAYOUTS[layoutId];

  // Build baseKey → [sounds] map
  const keyMap = useMemo(() => {
    const map = {};
    for (const sound of sounds) {
      if (!sound.shortcut) continue;
      const base = getShortcutBaseKey(sound.shortcut);
      if (!base) continue;
      if (!map[base]) map[base] = [];
      map[base].push(sound);
    }
    return map;
  }, [sounds]);

  const displayColor = (sound) => adaptColorForTheme(sound.color, settings.theme);
  const zoom = settings.keyboardZoom ?? 1;
  const UNIT = Math.round(BASE_UNIT * zoom);
  const layoutIds = Object.keys(LAYOUTS);
  const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.2, 1.4, 1.6, 1.8, 2];
  const zoomIn  = () => { const next = ZOOM_STEPS.find(z => z > zoom); if (next) updateSettings({ keyboardZoom: next }); };
  const zoomOut = () => { const prev = [...ZOOM_STEPS].reverse().find(z => z < zoom); if (prev) updateSettings({ keyboardZoom: prev }); };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-mono text-[#5c665a] uppercase tracking-widest">Klavye:</span>
        <div className="flex overflow-hidden border border-app-border">
          {layoutIds.map((id) => (
            <button
              key={id}
              onClick={() => updateSettings({ keyboardLayout: id })}
              className="px-3 py-1 text-[10px] font-bold font-mono tracking-wider transition-colors"
              style={layoutId === id
                ? { background: 'var(--accent)', color: '#0b0d0b' }
                : { background: '#141714', color: '#5c665a' }
              }
            >
              {LAYOUTS[id].name}
            </button>
          ))}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={zoomOut}
            disabled={zoom <= ZOOM_STEPS[0]}
            className="w-6 h-6 flex items-center justify-center border border-app-border text-[#5c665a] hover:text-white hover:border-[rgba(196,255,0,0.3)] disabled:opacity-30 transition-colors font-mono text-sm"
          >−</button>
          <span className="text-[10px] font-mono text-[#5c665a] w-8 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={zoomIn}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            className="w-6 h-6 flex items-center justify-center border border-app-border text-[#5c665a] hover:text-white hover:border-[rgba(196,255,0,0.3)] disabled:opacity-30 transition-colors font-mono text-sm"
          >+</button>
        </div>

        <span className="text-[10px] font-mono text-[#3c4238]">
          {Object.keys(keyMap).length} atanmış
        </span>
      </div>

      {/* Keyboard */}
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ display: 'inline-block', background: '#0d100d', border: '1px solid #1e231e', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
            {layout.rows.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: GAP, alignItems: 'center' }}>
                {row.map((k, ki) => (
                  <Key
                    key={ki}
                    k={k}
                    sounds={k.gap ? [] : (keyMap[k.id] || [])}
                    onPlay={playSound}
                    displayColor={displayColor}
                    UNIT={UNIT}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-[#3c4238]">
        <div className="flex items-center gap-1.5">
          <div style={{ width:14, height:14, background:'#c4ff0066', borderRadius:2 }} />
          <span>Ses atanmış</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width:14, height:14, background:'#161a16', border:'1px solid #1e231e', borderRadius:2 }} />
          <span>Atanmamış</span>
        </div>
        <span>· Tıklayarak çal</span>
      </div>
    </div>
  );
}
