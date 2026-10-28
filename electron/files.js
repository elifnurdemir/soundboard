// Ses/görsel dosyalarını silme ve kayıt dışı (hiçbir sese bağlı olmayan) dosyaları bulma.
// Silme yalnızca uygulamanın kendi klasörlerinin (ses ve görsel) içindeki dosyalara uygulanır:
// kullanıcının başka yerdeki dosyalarına asla dokunmaz.
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.wma', '.mp4', '.webm', '.mov', '.mkv']);

// Dosya yolu ya da file:// adresi → düz yol. blob:, data:, http gibi adresler dosya değildir.
function toFsPath(p) {
  if (typeof p !== 'string' || !p) return null;
  if (/^file:/i.test(p)) {
    try { return fileURLToPath(p); } catch (_) { return null; }
  }
  if (/^(blob:|data:|https?:)/i.test(p)) return null;
  return p;
}

// Windows'ta büyük/küçük harf ayrımı yok
function norm(p) {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

function isInside(root, target) {
  const rel = path.relative(norm(root), norm(target));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * roots içindeki dosyaları siler. roots dışındakileri, klasörleri ve geçersiz yolları atlar.
 * Dönen: { deleted: [yol], missing: [yol], skipped: [{ path, reason }], failed: [{ path, error }] }
 */
function deleteFiles(roots, paths) {
  const out = { deleted: [], missing: [], skipped: [], failed: [] };
  const seen = new Set();
  for (const raw of paths) {
    const p = toFsPath(raw);
    if (!p) { out.skipped.push({ path: raw, reason: 'invalid' }); continue; }
    const key = norm(p);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!roots.some((root) => isInside(root, p))) { out.skipped.push({ path: p, reason: 'outside' }); continue; }
    try {
      const st = fs.lstatSync(p);
      if (!st.isFile() && !st.isSymbolicLink()) { out.skipped.push({ path: p, reason: 'not-a-file' }); continue; }
      fs.unlinkSync(p);
      out.deleted.push(p);
    } catch (err) {
      if (err.code === 'ENOENT') out.missing.push(p);
      else out.failed.push({ path: p, error: err.message });
    }
  }
  return out;
}

/**
 * soundsDir içinde olup referenced listesindeki hiçbir sese bağlı olmayan ses dosyalarını döner.
 * Eşleştirme kasıtlı olarak temkinli: tam yol YA DA aynı dosya adı eşleşirse "bağlı" sayılır,
 * böylece yol yazımı farkları yüzünden kullanımdaki bir dosya yanlışlıkla kayıt dışı görünmez.
 */
function findOrphans(soundsDir, referenced) {
  let entries;
  try { entries = fs.readdirSync(soundsDir, { withFileTypes: true }); } catch (_) { return []; }

  const fullPaths = new Set();
  const baseNames = new Set();
  for (const raw of referenced) {
    const p = toFsPath(raw);
    if (!p) continue;
    fullPaths.add(norm(p));
    baseNames.add(path.basename(p).toLowerCase());
  }

  const orphans = [];
  for (const e of entries) {
    if (!e.isFile() || !AUDIO_EXT.has(path.extname(e.name).toLowerCase())) continue;
    const full = path.join(soundsDir, e.name);
    if (fullPaths.has(norm(full)) || baseNames.has(e.name.toLowerCase())) continue;
    try {
      const st = fs.statSync(full);
      orphans.push({ path: full, name: e.name, size: st.size, mtimeMs: st.mtimeMs });
    } catch (_) { /* arada silinmiş olabilir */ }
  }
  return orphans.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

module.exports = { deleteFiles, findOrphans, isInside, toFsPath };
