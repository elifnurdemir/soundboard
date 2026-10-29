// Ses paketi (.padopack): bir kategoriyi sesleri, görselleri ve ayarlarıyla tek dosyada paylaşmak için.
// Paket başkasından gelir, yani güvenilmez: içindeki yollara, adlara ve sayılara asla doğrudan güvenilmez.
// Dosyalar zip'teki adla değil, burada üretilen güvenli adla ve yalnızca hedef klasörlere yazılır.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const FORMAT = 'padopack';
const VERSION = 1;
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.webm']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const LIMITS = { sounds: 500, fileBytes: 100 * 1024 * 1024, totalBytes: 1024 * 1024 * 1024, manifestBytes: 2 * 1024 * 1024 };

// Pakete giren ses ayarları. Kısayol, sohbet komutu, favori ve çalma sayısı kişiseldir, paylaşılmaz.
const NUMERIC = {
  volume: [0, 1, 0.8], fadeIn: [0, 30, 0], fadeOut: [0, 30, 0], trimStart: [0, 86400, 0],
  playbackRate: [0.25, 4, 1], bass: [-24, 24, 0], treble: [-24, 24, 0], reverb: [0, 1, 0], cooldown: [0, 3600, 0],
};
const BOOL = { loop: false, overlap: true, noColor: false };

const safeName = (n, fallback = 'ses') =>
  String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback;
const safeText = (v, max = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, max) : '');
const clamp = (v, [min, max, def]) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

function cleanSettings(src) {
  const out = {};
  for (const [k, range] of Object.entries(NUMERIC)) out[k] = clamp(src[k], range);
  for (const [k, def] of Object.entries(BOOL)) out[k] = typeof src[k] === 'boolean' ? src[k] : def;
  const trimEnd = typeof src.trimEnd === 'number' && Number.isFinite(src.trimEnd) ? src.trimEnd : null;
  out.trimEnd = trimEnd != null && trimEnd > out.trimStart ? Math.min(trimEnd, 86400) : null;
  if (isColor(src.color)) out.color = src.color;
  out.name = safeText(src.name, 80) || 'Ses';
  if (src.credit && typeof src.credit === 'object') {
    const c = {};
    for (const k of ['title', 'creator', 'license', 'licenseUrl', 'sourceUrl']) if (src.credit[k]) c[k] = safeText(src.credit[k], 300);
    if (Object.keys(c).length) out.credit = c;
  }
  return out;
}

/**
 * Kategori ve sesleri paket olarak zip'ler. Dönen: { buffer, count, skipped }.
 * Dosyası bulunamayan sesler atlanır (skipped).
 */
function buildPack({ category, sounds, appVersion }) {
  const zip = new AdmZip();
  const manifest = {
    format: FORMAT, version: VERSION, app: `Padoboard ${appVersion || ''}`.trim(), createdAt: new Date().toISOString(),
    name: safeText(category?.name, 80) || 'Ses paketi', color: isColor(category?.color) ? category.color : undefined, sounds: [],
  };
  let skipped = 0;
  sounds.forEach((s) => {
    const ext = path.extname(s.filePath || '').toLowerCase();
    if (!s.filePath || !AUDIO_EXT.has(ext) || !fs.existsSync(s.filePath)) { skipped++; return; }
    const n = manifest.sounds.length + 1;
    const entry = { ...cleanSettings(s), file: `sounds/${n}${ext}` };
    zip.addLocalFile(s.filePath, 'sounds', `${n}${ext}`);
    const imgExt = path.extname(s.image || '').toLowerCase();
    if (s.image && IMAGE_EXT.has(imgExt) && fs.existsSync(s.image)) {
      entry.image = `images/${n}${imgExt}`;
      zip.addLocalFile(s.image, 'images', `${n}${imgExt}`);
    }
    manifest.sounds.push(entry);
  });
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  return { buffer: zip.toBuffer(), count: manifest.sounds.length, skipped };
}

function uniquePath(dir, base, ext) {
  let p = path.join(dir, `${base}${ext}`), i = 1;
  while (fs.existsSync(p)) { p = path.join(dir, `${base}_${i}${ext}`); i++; }
  return p;
}

class PackError extends Error {}

/**
 * Paketi doğrular ve dosyaları soundsDir / imagesDir içine yeni adlarla yazar.
 * Dönen: { category: { name, color }, sounds: [ses ayarları + filePath, image] }.
 * Geçersiz pakette PackError fırlatır; yarıda kalırsa o ana kadar yazılan dosyaları siler.
 */
function readPack(input, { soundsDir, imagesDir }) {
  let zip;
  try { zip = new AdmZip(input); } catch (_) { throw new PackError('Dosya bir Padoboard paketi değil (zip açılamadı)'); }
  const entries = new Map();
  let total = 0;
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    total += e.header.size;
    if (e.header.size > LIMITS.fileBytes || total > LIMITS.totalBytes) throw new PackError('Paket çok büyük');
    entries.set(e.entryName, e);
  }
  const m = entries.get('manifest.json');
  if (!m || m.header.size > LIMITS.manifestBytes) throw new PackError('Dosya bir Padoboard paketi değil (manifest yok)');
  let manifest;
  try { manifest = JSON.parse(m.getData().toString('utf-8')); } catch (_) { throw new PackError('Paket bozuk (manifest okunamadı)'); }
  if (manifest?.format !== FORMAT || !Array.isArray(manifest.sounds)) throw new PackError('Dosya bir Padoboard paketi değil');
  if (manifest.version > VERSION) throw new PackError('Bu paket Padoboard\'un daha yeni bir sürümüyle yapılmış, önce güncelle');
  if (manifest.sounds.length > LIMITS.sounds) throw new PackError(`Pakette en çok ${LIMITS.sounds} ses olabilir`);

  // Yalnızca bizim ürettiğimiz biçimdeki adlar kabul edilir: "sounds/12.mp3", "images/12.png"
  const pick = (name, folder, allowed) => {
    if (typeof name !== 'string') return null;
    const match = new RegExp(`^${folder}/\\d{1,4}(\\.[a-z0-9]{2,5})$`).exec(name);
    if (!match || !allowed.has(match[1])) return null;
    const e = entries.get(name);
    return e ? { entry: e, ext: match[1] } : null;
  };

  fs.mkdirSync(soundsDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  const written = [];
  // Zip'te yazan boyut yalan olabilir (zip bombası): açılan verinin gerçek boyutu da denetlenir
  const dataOf = (e) => {
    const d = e.getData();
    if (d.length > LIMITS.fileBytes) throw new PackError('Paket çok büyük');
    return d;
  };
  try {
    const sounds = [];
    for (const raw of manifest.sounds) {
      if (!raw || typeof raw !== 'object') continue;
      const audio = pick(raw.file, 'sounds', AUDIO_EXT);
      if (!audio) continue;
      const settings = cleanSettings(raw);
      const filePath = uniquePath(soundsDir, safeName(settings.name), audio.ext);
      fs.writeFileSync(filePath, dataOf(audio.entry));
      written.push(filePath);
      let image = '';
      const img = pick(raw.image, 'images', IMAGE_EXT);
      if (img) {
        image = uniquePath(imagesDir, safeName(settings.name, 'gorsel'), img.ext);
        fs.writeFileSync(image, dataOf(img.entry));
        written.push(image);
      }
      sounds.push({ ...settings, filePath, image });
    }
    if (!sounds.length) throw new PackError('Pakette ses yok');
    return {
      category: { name: safeText(manifest.name, 80) || 'Ses paketi', color: isColor(manifest.color) ? manifest.color : null },
      sounds,
    };
  } catch (err) {
    written.forEach((p) => { try { fs.unlinkSync(p); } catch (_) { /* yoksa geç */ } });
    throw err;
  }
}

module.exports = { buildPack, readPack, PackError, LIMITS };
