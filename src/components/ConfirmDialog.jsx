import { useEffect } from 'react';
import useSoundStore from '../store/useSoundStore';

// Genel onay penceresi: useSoundStore.getState().askConfirm({ title, message, confirmLabel, danger, onConfirm })
export default function ConfirmDialog() {
  const dialog = useSoundStore((s) => s.confirmDialog);
  const closeConfirm = useSoundStore((s) => s.closeConfirm);

  useEffect(() => {
    if (!dialog) return;
    const h = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); closeConfirm(); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [dialog, closeConfirm]);

  if (!dialog) return null;

  const confirm = () => {
    closeConfirm();
    dialog.onConfirm?.();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 modal-backdrop bg-black/60" onClick={closeConfirm} />
      <div className="relative w-96 max-w-[90vw] bg-app-bg border border-app-border shadow-2xl fade-in p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] font-mono" style={{ color: dialog.danger ? '#f87171' : 'var(--accent)' }}>
          {dialog.title}
        </h3>
        <p className="text-sm text-[#b8c2b5] leading-relaxed whitespace-pre-line">{dialog.message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={closeConfirm}
            autoFocus
            className="px-4 py-2 text-xs font-bold font-mono tracking-wider bg-app-surface border border-app-border text-[#8e9c8b] hover:text-white"
          >
            VAZGEÇ
          </button>
          <button
            onClick={confirm}
            className={`px-4 py-2 text-xs font-bold font-mono tracking-wider ${dialog.danger ? 'bg-red-600 hover:bg-red-500 text-white' : 'btn-accent'}`}
          >
            {dialog.confirmLabel || 'TAMAM'}
          </button>
        </div>
      </div>
    </div>
  );
}
