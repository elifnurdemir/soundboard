import useSoundStore from '../store/useSoundStore';
import { adaptColorForTheme } from '../store/useSoundStore';

export default function SoundQueue() {
  const { soundQueue, playingSounds, sounds, clearQueue, removeFromQueue, settings } = useSoundStore();

  const playingIds = Object.keys(playingSounds).filter((id) => playingSounds[id]?.length > 0);
  const playingSound = playingIds.length > 0 ? sounds.find((s) => s.id === playingIds[0]) : null;

  if (!playingSound && soundQueue.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-64 border border-app-border shadow-2xl fade-in overflow-hidden" style={{ background: '#141714' }}>
      <div className="h-0.5 w-full" style={{ background: 'var(--accent)' }} />

      <div className="px-3 py-2 flex items-center justify-between border-b border-app-border">
        <span className="text-[10px] font-bold font-mono tracking-widest" style={{ color: 'var(--accent)' }}>
          KUYRUK {soundQueue.length > 0 && `· ${soundQueue.length}`}
        </span>
        {soundQueue.length > 0 && (
          <button
            onClick={clearQueue}
            className="text-[10px] font-mono text-[#5c665a] hover:text-red-400 transition-colors"
          >
            TEMİZLE
          </button>
        )}
      </div>

      {/* Currently playing */}
      {playingSound && (
        <div className="px-3 py-2 flex items-center gap-2 border-b border-app-border">
          <div
            className="w-2 h-2 rounded-full shrink-0 animate-pulse"
            style={{ background: 'var(--accent)' }}
          />
          <div
            className="w-5 h-5 shrink-0 rounded-sm"
            style={{ background: adaptColorForTheme(playingSound.color, settings.theme) }}
          />
          <span className="text-xs font-mono text-white truncate flex-1">{playingSound.name}</span>
          <span className="text-[9px] font-mono shrink-0" style={{ color: 'var(--accent)' }}>ŞİMDİ</span>
        </div>
      )}

      {/* Queue items */}
      {soundQueue.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          {soundQueue.map((sound, i) => (
            <div
              key={`${sound.id}-${i}`}
              className="px-3 py-1.5 flex items-center gap-2 hover:bg-app-surface transition-colors group"
            >
              <span className="text-[9px] font-mono w-4 text-right shrink-0" style={{ color: '#3c4238' }}>
                {i + 1}
              </span>
              <div
                className="w-4 h-4 shrink-0 rounded-sm"
                style={{ background: adaptColorForTheme(sound.color, settings.theme) }}
              />
              <span className="text-xs font-mono text-[#8e9c8b] truncate flex-1">{sound.name}</span>
              <button
                onClick={() => removeFromQueue(i)}
                className="text-[#3c4238] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
