import { useState } from 'react';
import useSoundStore from '../store/useSoundStore';
import { TRASH_DAYS, daysLeft, formatSize } from '../store/trash';

const baseName = (p) => String(p || '').split(/[\\/]/).pop();

function Btn({ children, onClick, danger, disabled, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-3 py-1.5 text-[11px] font-bold font-mono tracking-wider border transition-colors disabled:opacity-40 ${
        danger
          ? 'bg-app-surface border-app-border text-[#8e9c8b] hover:border-red-500/50 hover:text-red-400'
          : 'bg-app-surface border-app-border text-[#8e9c8b] hover:border-[rgba(196,255,0,0.4)] hover:text-[#c4ff00]'
      }`}
    >
      {children}
    </button>
  );
}

function OrphanScanner() {
  const { sounds, trash, trashOrphanFiles, deleteOrphanFiles, askConfirm, showToast } = useSoundStore();
  const [files, setFiles] = useState(null); // null = taranmadı
  const [busy, setBusy] = useState(false);

  if (!window.electronAPI?.findOrphanFiles) return null;

  const scan = async () => {
    setBusy(true);
    const referenced = [...sounds.map((s) => s.filePath), ...trash.map((t) => t.sound.filePath)].filter(Boolean);
    const res = await window.electronAPI.findOrphanFiles(referenced);
    setFiles(res?.files || []);
    setBusy(false);
  };

  const total = (files || []).reduce((n, f) => n + f.size, 0);

  const toTrash = () => {
    const n = trashOrphanFiles(files);
    setFiles(null);
    showToast(`${n} dosya çöp kutusuna taşındı (${TRASH_DAYS} gün geri alınabilir)`);
  };

  const deleteAll = () => askConfirm({
    title: 'Dosyaları kalıcı sil',
    message: `${files.length} dosya (${formatSize(total)}) diskten silinecek. Bu işlem geri alınamaz.\n\nEmin değilsen önce "ÇÖP KUTUSUNA AT" ile taşı; içlerinden lazım olanı geri alabilirsin.`,
    confirmLabel: 'KALICI SİL',
    danger: true,
    onConfirm: async () => {
      const n = await deleteOrphanFiles(files);
      setFiles(null);
      showToast(`${n} dosya silindi`);
    },
  });

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] font-mono" style={{ color: '#8e9c8b' }}>KAYIT DIŞI DOSYALAR</h3>
        <p className="text-xs font-mono text-[#5c665a] mt-1 leading-relaxed">
          Ses klasöründe duran ama hiçbir butona bağlı olmayan dosyalar. Eski silmelerden kalmış olabilir ve yer kaplar.
        </p>
      </div>

      {files === null ? (
        <Btn onClick={scan} disabled={busy}>{busy ? 'TARANIYOR...' : 'KLASÖRÜ TARA'}</Btn>
      ) : files.length === 0 ? (
        <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>✓ Kayıt dışı dosya yok.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-mono text-white">
            {files.length} dosya bulundu · {formatSize(total)}
          </p>
          <div className="max-h-52 overflow-y-auto border border-app-border bg-app-surface divide-y divide-app-border">
            {files.map((f) => (
              <div key={f.path} className="flex items-center gap-3 px-3 py-1.5 text-xs font-mono">
                <span className="flex-1 truncate text-[#b8c2b5]" title={f.path}>{f.name}</span>
                <span className="text-[#5c665a] shrink-0">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Btn onClick={toTrash} title="30 gün içinde geri alınabilir">ÇÖP KUTUSUNA AT</Btn>
            <Btn onClick={deleteAll} danger>HEPSİNİ KALICI SİL</Btn>
            <Btn onClick={() => setFiles(null)}>KAPAT</Btn>
          </div>
        </div>
      )}
    </section>
  );
}

export default function TrashBoard() {
  const { trash, categories, restoreFromTrash, deleteFromTrash, emptyTrash, askConfirm, showToast } = useSoundStore();

  const catColor = (id) => categories.find((c) => c.id === id)?.color || '#3c4238';

  const deleteOne = (entry) => askConfirm({
    title: 'Kalıcı sil',
    message: `"${entry.sound.name}" ve dosyası diskten silinecek. Bu işlem geri alınamaz.`,
    confirmLabel: 'KALICI SİL',
    danger: true,
    onConfirm: async () => {
      const r = await deleteFromTrash([entry.trashId]);
      showToast(r.shared ? `Kayıt silindi (dosyası başka bir sesle paylaşıldığı için korundu)` : `"${entry.sound.name}" ve dosyası silindi`);
    },
  });

  const emptyAll = () => askConfirm({
    title: 'Çöp kutusunu boşalt',
    message: `${trash.length} ses ve dosyaları diskten silinecek. Bu işlem geri alınamaz.`,
    confirmLabel: 'BOŞALT',
    danger: true,
    onConfirm: emptyTrash,
  });

  return (
    <div className="space-y-8 max-w-3xl">
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest font-mono" style={{ color: 'var(--accent)' }}>ÇÖP KUTUSU</h2>
            <p className="text-xs font-mono text-[#5c665a] mt-1 leading-relaxed">
              Sildiğin sesler {TRASH_DAYS} gün burada kalır, sonra dosyalarıyla birlikte kalıcı silinir.
            </p>
          </div>
          {trash.length > 0 && <Btn onClick={emptyAll} danger>ÇÖPÜ BOŞALT</Btn>}
        </div>

        {trash.length === 0 ? (
          <p className="text-xs font-mono text-[#3c4238] py-6">Çöp kutusu boş.</p>
        ) : (
          <div className="border border-app-border bg-app-surface divide-y divide-app-border">
            {trash.map((entry) => {
              const left = daysLeft(entry);
              return (
                <div key={entry.trashId} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-2 h-2 shrink-0" style={{ background: entry.sound.color || catColor(entry.sound.categoryId) }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-white truncate">
                      {entry.sound.name}
                      {entry.orphan && <span className="ml-2 text-[9px] px-1 py-0.5 bg-black/40 text-[#8e9c8b]">KAYIT DIŞI DOSYA</span>}
                    </p>
                    <p className="text-[10px] font-mono text-[#5c665a] truncate" title={entry.sound.filePath}>{baseName(entry.sound.filePath)}</p>
                  </div>
                  <span className={`text-[10px] font-mono shrink-0 ${left <= 3 ? 'text-red-400' : 'text-[#5c665a]'}`}>
                    {left === 0 ? 'bugün silinir' : `${left} gün kaldı`}
                  </span>
                  <Btn onClick={() => restoreFromTrash(entry.trashId)}>GERİ AL</Btn>
                  <Btn onClick={() => deleteOne(entry)} danger title="Dosyasıyla birlikte kalıcı sil">KALICI SİL</Btn>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <OrphanScanner />
    </div>
  );
}
