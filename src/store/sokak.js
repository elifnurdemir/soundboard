// "Sokak" buton konsepti: tuğla duvar, sprey başlık. Renk, eğim ve duvar kayması her ses için sabittir
// (kimlikten türetilir), bu yüzden uygulama her açıldığında aynı görünür.
export const SOKAK_PALETTE = ['#c4ff00', '#ff4fa8', '#22d3ee', '#ffd21f', '#ff7a1a'];
export const SOKAK_ROT = [2, 6]; // derece, işareti sesten sese değişir

export function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Uzun başlığı en dengeli noktadan iki satıra böler (tek sözcük ya da kısa başlık tek satır kalır)
export function splitTitle(s) {
  const w = String(s).trim().split(/\s+/);
  const t = w.join(' ');
  if (w.length < 2 || t.length <= 7) return [t];
  let best = null, bi = 1;
  for (let i = 1; i < w.length; i++) {
    const m = Math.max(w.slice(0, i).join(' ').length, w.slice(i).join(' ').length);
    if (best === null || m < best) { best = m; bi = i; }
  }
  return [w.slice(0, bi).join(' '), w.slice(bi).join(' ')];
}

/**
 * Izgaradaki sırayla gelen ses kimlikleri için renk, eğim ve duvar kayması üretir.
 * Soldaki, üstteki ve sol üstteki komşuyla aynı renk çıkmaz; palet dengeli dağılır.
 * Dönen dizi ids ile aynı sıradadır: { color, rot, dx, dy }
 */
export function assignSokak(ids, cols) {
  const c = Math.max(1, cols | 0);
  const out = [];
  const used = SOKAK_PALETTE.map(() => 0);
  ids.forEach((id, i) => {
    const r = rng(hashId(id));
    const forbid = new Set();
    if (i % c > 0) forbid.add(out[i - 1].pi);
    if (i >= c) forbid.add(out[i - c].pi);
    if (i >= c && i % c > 0) forbid.add(out[i - c - 1].pi);
    const opts = SOKAK_PALETTE.map((_, k) => k).filter((k) => !forbid.has(k));
    const min = Math.min(...opts.map((k) => used[k]));
    const cand = opts.filter((k) => used[k] === min);
    const pi = cand[Math.floor(r() * cand.length)];
    used[pi]++;
    const rot = (r() < 0.5 ? -1 : 1) * (SOKAK_ROT[0] + r() * (SOKAK_ROT[1] - SOKAK_ROT[0]));
    out.push({ pi, color: SOKAK_PALETTE[pi], rot, dx: Math.floor(r() * 40), dy: Math.floor(r() * 20) });
  });
  return out;
}
