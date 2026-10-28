import { useEffect } from 'react';
import useSoundStore from '../store/useSoundStore';

const SHOW_MS = 8000;

// Alttaki kısa bildirim. Silme bildiriminde "GERİ AL" düğmesi (ve Ctrl+Z) sesi geri getirir.
export default function Toast() {
  const toast = useSoundStore((s) => s.toast);
  const clearToast = useSoundStore((s) => s.clearToast);
  const restoreFromTrash = useSoundStore((s) => s.restoreFromTrash);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, SHOW_MS);
    return () => clearTimeout(t);
  }, [toast?.id, clearToast]);

  // Ctrl+Z: son silineni geri al (yazı yazarken devre dışı)
  useEffect(() => {
    if (!toast?.trashId) return;
    const h = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)))) return;
      e.preventDefault();
      restoreFromTrash(toast.trashId);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [toast?.trashId, restoreFromTrash]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] fade-in" role="status">
      <div className="flex items-center gap-3 pl-4 pr-2 py-2 bg-app-raised border border-app-border shadow-2xl">
        <span className="text-xs font-mono text-white max-w-[26rem] truncate">{toast.message}</span>
        {toast.trashId && (
          <button
            onClick={() => restoreFromTrash(toast.trashId)}
            className="px-3 py-1.5 text-[11px] font-bold font-mono tracking-wider btn-accent"
            title="Ctrl+Z"
          >
            GERİ AL
          </button>
        )}
        <button onClick={clearToast} className="w-6 h-6 text-[#5c665a] hover:text-white text-xs" title="Kapat">✕</button>
      </div>
    </div>
  );
}
