import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// items: { label, onClick, danger, disabled, checked } | { separator: true } | { header: 'Başlık' }
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Ekranın dışına taşmasın
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close);
    };
  }, [onClose]);

  // Portal: sürükle-bırak için dönüşüm uygulanan üst öğe fixed konumu bozmasın, olaylar butona sızmasın
  return createPortal(
    <div
      className="fixed inset-0 z-[65]"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
    >
      <div
        ref={ref}
        className="absolute min-w-[200px] max-h-[80vh] overflow-y-auto py-1 bg-app-raised border border-app-border shadow-2xl fade-in"
        style={pos}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, i) => {
          if (item.separator) return <div key={i} className="my-1 h-px bg-app-border" />;
          if (item.header) {
            return <p key={i} className="px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-[0.12em] font-mono text-[#5c665a]">{item.header}</p>;
          }
          return (
            <button
              key={i}
              disabled={item.disabled}
              onClick={() => { onClose(); item.onClick?.(); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono transition-colors disabled:opacity-40 disabled:cursor-default ${
                item.danger ? 'text-red-400 hover:bg-red-600/15' : 'text-[#d0d8ce] hover:bg-app-surface hover:text-white'
              }`}
            >
              <span className="w-3 shrink-0 text-center" style={{ color: 'var(--accent)' }}>{item.checked ? '✓' : ''}</span>
              <span className="flex-1 truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
