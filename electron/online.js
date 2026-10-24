// Çevrimiçi ses kütüphanesi: Openverse (anahtarsız), yalnızca CC0.
// İstekler ana süreçten gider: tarayıcı sınırı (CORS) olmaz, kendi User-Agent'ımızı koyarız, indirme güvenlik kontrollerinden geçer.
// Önizleme dinlemek indirme değildir: arayüz önizleme linkini doğrudan akış (stream) olarak çalar, diske hiçbir şey yazılmaz.
// İndirme sadece kullanıcı sesi yerel kütüphaneye ya da zaman çizelgesine aldığında olur.
const fs = require('fs');
const path = require('path');

const UA = 'SoundboardApp/1.0 (+https://github.com/elifnurdemir/soundboard)';
const API = 'https://api.openverse.org/v1/audio/';
const CACHE_MS = 10 * 60 * 1000;
const MAX_CACHE = 60;
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_HOSTS = [/(^|\.)freesound\.org$/, /(^|\.)wikimedia\.org$/, /(^|\.)archive\.org$/, /(^|\.)ccmixter\.org$/];
const AUDIO_EXT = new Set(['mp3', 'ogg', 'wav', 'flac', 'm4a']);

const cache = new Map(); // "sorgu|sayfa" → { at, data }
let quota = null; // son görülen kalan hak (Openverse yanıt başlıklarından)

function hostAllowed(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && ALLOWED_HOSTS.some((r) => r.test(x.hostname));
  } catch (_) {
    return false;
  }
}

function readQuota(h) {
  const day = Number(h.get('x-ratelimit-available-anon_sustained'));
  const minute = Number(h.get('x-ratelimit-available-anon_burst'));
  return Number.isFinite(day) || Number.isFinite(minute)
    ? { day: Number.isFinite(day) ? day : null, minute: Number.isFinite(minute) ? minute : null }
    : null;
}

function normalize(r) {
  const ext = String(r.filetype || '').toLowerCase();
  if (!r || !r.url || !hostAllowed(r.url) || !AUDIO_EXT.has(ext)) return null;
  if (String(r.license || '').toLowerCase() !== 'cc0') return null; // sunucu süzgecine ek güvenlik
  return {
    id: String(r.id),
    title: String(r.title || 'Adsız').slice(0, 80),
    creator: String(r.creator || '').slice(0, 60),
    license: 'CC0',
    licenseUrl: r.license_url || 'https://creativecommons.org/publicdomain/zero/1.0/',
    durationMs: Number.isFinite(r.duration) ? r.duration : null,
    previewUrl: r.url,
    sourceUrl: r.foreign_landing_url || '',
    ext,
    size: Number.isFinite(r.filesize) ? r.filesize : null,
    provider: String(r.provider || ''),
  };
}

async function search(query, page = 1) {
  const q = String(query || '').trim().slice(0, 80);
  if (!q) return { success: true, items: [], hasMore: false, total: 0, quota };
  const p = Math.max(1, Math.min(12, Number.parseInt(page, 10) || 1)); // Openverse anonim kullanıcıya sayfa derinliği (12) ve sayfa başına 20 sonuç sınırı koyar
  const key = `${q.toLowerCase()}|${p}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.data, cached: true, quota };

  const url = `${API}?${new URLSearchParams({ q, license: 'cc0', page_size: '20', page: String(p), mature: 'false' })}`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
  } catch (_) {
    return { success: false, error: 'Bağlanılamadı. İnternet bağlantını kontrol et.' };
  }
  quota = readQuota(res.headers) || quota;
  if (res.status === 429) {
    return { success: false, limited: true, quota, error: 'Çevrimiçi arama sınırı doldu (dakikada 20, günde 200). Biraz bekleyip tekrar dene.' };
  }
  if (!res.ok) return { success: false, error: `Servis hata verdi (${res.status}).` };

  let json;
  try {
    json = await res.json();
  } catch (_) {
    return { success: false, error: 'Servisten beklenmeyen yanıt geldi.' };
  }
  const items = (json.results || []).map(normalize).filter(Boolean);
  const data = {
    success: true,
    items,
    hasMore: p < (json.page_count || 1) && p < 12,
    total: json.result_count || items.length,
  };
  cache.set(key, { at: Date.now(), data });
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return { ...data, quota };
}

const slug = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Renderer'dan gelen öğeye güvenmez: adres, tür ve boyut burada yeniden doğrulanır.
async function download(item, folder) {
  const url = item && item.previewUrl;
  if (!hostAllowed(url)) return { success: false, error: 'Bu kaynaktan indirmeye izin verilmiyor.' };
  const ext = AUDIO_EXT.has(String(item.ext || '').toLowerCase()) ? String(item.ext).toLowerCase() : 'mp3';
  const tag = String(item.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 8);
  fs.mkdirSync(folder, { recursive: true });
  const dest = path.join(folder, `${slug(item.title) || 'ses'}-${tag}.${ext}`);
  if (fs.existsSync(dest)) return { success: true, destPath: dest, reused: true };

  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  } catch (_) {
    return { success: false, error: 'İndirilemedi, bağlantı kurulamadı.' };
  }
  if (!res.ok) return { success: false, error: `İndirilemedi (${res.status}).` };
  if (!hostAllowed(res.url)) return { success: false, error: 'Yönlendirme izinli olmayan bir siteye gitti.' };
  if (!/^audio\/|octet-stream|ogg/i.test(res.headers.get('content-type') || '')) {
    return { success: false, error: 'Dosya bir ses dosyası değil.' };
  }
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) return { success: false, error: 'Dosya çok büyük (25 MB üstü).' };

  const chunks = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      // eslint-disable-next-line no-await-in-loop
      await reader.cancel();
      return { success: false, error: 'Dosya çok büyük (25 MB üstü).' };
    }
    chunks.push(Buffer.from(value));
  }
  fs.writeFileSync(dest, Buffer.concat(chunks));
  return { success: true, destPath: dest };
}

module.exports = { search, download, hostAllowed };
