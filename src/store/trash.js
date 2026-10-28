// Çöp kutusu mantığı (saf fonksiyonlar). Silinen sesler TRASH_DAYS gün kurtarılabilir.
export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const TRASH_MS = TRASH_DAYS * DAY_MS;

// Aynı dosyaya farklı yazımlarla (\ ya da /, büyük/küçük harf) bakılsa da eşleşsin
const keyOf = (p) => String(p).replace(/\\/g, '/').toLowerCase();
const filesOf = (sound) => [sound.filePath, sound.image].filter(Boolean);

export function splitExpired(trash, now = Date.now()) {
  const expired = [];
  const kept = [];
  trash.forEach((t) => (now - t.deletedAt >= TRASH_MS ? expired : kept).push(t));
  return { expired, kept };
}

export function daysLeft(entry, now = Date.now()) {
  return Math.max(0, Math.ceil((entry.deletedAt + TRASH_MS - now) / DAY_MS));
}

/**
 * removed seslerinin dosyalarından, stillUsed seslerinden hiçbiri kullanmayanları döner.
 * Aynı dosyayı kullanan başka bir ses ya da çöp kutusu kaydı varsa o dosya silinmez.
 */
export function unreferencedFiles(removed, stillUsed) {
  const used = new Set(stillUsed.flatMap(filesOf).map(keyOf));
  const out = new Map();
  removed.flatMap(filesOf).forEach((f) => {
    const k = keyOf(f);
    if (!used.has(k) && !out.has(k)) out.set(k, f);
  });
  return [...out.values()];
}

// Kayıt dışı bir dosyayı çöp kutusuna koymak için asgari ses kaydı (geri alınınca varsayılanlar eklenir)
export function orphanToSound(file, id) {
  const base = file.name.replace(/\.[^.]+$/, '');
  return { id, name: base || file.name, filePath: file.path };
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
