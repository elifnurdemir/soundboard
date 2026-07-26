import { useState } from 'react';
import useLicenseStore from '../store/useLicenseStore';

function UpsellModal({ feature, onClose }) {
  const { activate, error } = useLicenseStore();
  const [key, setKey] = useState('');
  const [activating, setActivating] = useState(false);

  const handleActivate = async () => {
    if (!key.trim()) return;
    setActivating(true);
    const res = await activate(key);
    setActivating(false);
    if (res.success) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop bg-black/60" onClick={onClose}>
      <div
        className="bracket-4 bg-app-surface w-full max-w-sm mx-4 border border-app-border shadow-2xl fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] font-mono" style={{ color: 'var(--accent)' }}>
            🔒 PRO ÖZELLİK
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-[#5c665a] hover:text-white hover:bg-app-raised transition-colors text-xs">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm font-mono text-white">
            <strong>{feature}</strong>, Pro sürümde açılıyor — tek seferlik satın alım, abonelik yok.
          </p>

          <button
            onClick={() => window.electronAPI?.openCheckout()}
            className="w-full py-2.5 text-xs font-bold font-mono tracking-wider btn-accent"
          >
            SATIN AL
          </button>

          <div className="pt-3 border-t border-app-border space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] font-mono" style={{ color: '#8e9c8b' }}>
              Zaten satın aldıysan
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Lisans anahtarını yapıştır..."
                className="flex-1 min-w-0 bg-app-input border border-app-border px-3 py-2 text-sm text-white outline-none focus-lime font-mono placeholder-[#3c4238]"
              />
              <button
                onClick={handleActivate}
                disabled={activating || !key.trim()}
                className="px-3 py-2 bg-app-input border border-app-border hover:border-[rgba(196,255,0,0.3)] text-xs font-bold font-mono tracking-wider disabled:opacity-40 transition-colors shrink-0"
                style={{ color: 'var(--accent)' }}
              >
                {activating ? '...' : 'DOĞRULA'}
              </button>
            </div>
            {error && <p className="text-[10px] font-mono text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProGate({ feature, children }) {
  const status = useLicenseStore((s) => s.status);
  const [showUpsell, setShowUpsell] = useState(false);
  const isPro = status === 'pro';

  if (isPro) return children;

  return (
    <div className="relative">
      <div className="pointer-events-none opacity-40 select-none">{children}</div>
      <button
        type="button"
        onClick={() => setShowUpsell(true)}
        className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 hover:bg-black/55 transition-colors"
        title={`${feature} — Pro özellik`}
      >
        <span className="text-xs">🔒</span>
        <span className="tag-accent text-[9px]">PRO</span>
      </button>
      {showUpsell && <UpsellModal feature={feature} onClose={() => setShowUpsell(false)} />}
    </div>
  );
}
