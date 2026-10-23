// Ortak soundboard odası — host'un bilgisayarında çalışan küçük bir HTTP sunucusu.
// Arkadaşlar linki tarayıcıda açıp buton basar; ses HOST'un uygulamasında çalar
// (yani host'un sanal kablosundan Discord'a gider). Arkadaşlar ses dosyalarına
// erişemez, sadece "bu id'yi çal" isteği gönderebilir.
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { ROOM_PAGE } = require('./room-page');

const DEFAULT_PORT = 7842;
const MAX_BODY = 1024;
const PER_IP_COOLDOWN_MS = 1000;
const GLOBAL_LIMIT = { count: 12, windowMs: 10000 };

function makeToken() {
  // 6 haneli, karışabilecek karakterler (0/O, 1/I) yok
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function cleanName(raw) {
  // eslint-disable-next-line no-control-regex
  return String(raw || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24) || 'Misafir';
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

function createRoom({ getData, onPlay }) {
  let server = null;
  let state = null; // { port, token }
  const lastByIp = new Map();
  let recent = []; // timestamps of accepted plays

  const status = () => {
    if (!server || !state) return { running: false };
    return {
      running: true,
      port: state.port,
      token: state.token,
      urls: lanAddresses().map((ip) => `http://${ip}:${state.port}/?t=${state.token}`),
    };
  };

  function send(res, code, body, type = 'application/json; charset=utf-8') {
    res.writeHead(code, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { req.destroy(); resolve(null); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')); } catch (_) { resolve(null); }
      });
      req.on('error', () => resolve(null));
    });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('t') || req.headers['x-room-token'] || '';
    if (!state || !safeEqual(token, state.token)) {
      send(res, 401, { error: 'Geçersiz oda kodu' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      send(res, 200, ROOM_PAGE, 'text/html; charset=utf-8');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/sounds') {
      const data = getData() || {};
      const sounds = (data.sounds || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((s) => ({ id: s.id, name: s.name, color: s.color, categoryId: s.categoryId }));
      const categories = (data.categories || []).map((c) => ({ id: c.id, name: c.name }));
      send(res, 200, { sounds, categories });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/play') {
      const body = await readBody(req);
      if (!body || typeof body.id !== 'string') { send(res, 400, { error: 'Geçersiz istek' }); return; }

      const ip = req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      if (now - (lastByIp.get(ip) || 0) < PER_IP_COOLDOWN_MS) {
        send(res, 429, { error: 'Çok hızlı — bir saniye bekle' });
        return;
      }
      recent = recent.filter((t) => now - t < GLOBAL_LIMIT.windowMs);
      if (recent.length >= GLOBAL_LIMIT.count) {
        send(res, 429, { error: 'Oda şu an çok yoğun' });
        return;
      }

      const sound = ((getData() || {}).sounds || []).find((s) => s.id === body.id);
      if (!sound) { send(res, 404, { error: 'Ses bulunamadı' }); return; }

      lastByIp.set(ip, now);
      recent.push(now);
      onPlay({ soundId: sound.id, soundName: sound.name, who: cleanName(body.who) });
      send(res, 200, { ok: true });
      return;
    }

    send(res, 404, { error: 'Bulunamadı' });
  }

  async function start(port = DEFAULT_PORT) {
    if (server) return status();
    const token = makeToken();
    const srv = http.createServer((req, res) => {
      handle(req, res).catch(() => send(res, 500, { error: 'Sunucu hatası' }));
    });
    await new Promise((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(port, '0.0.0.0', () => { srv.off('error', reject); resolve(); });
    });
    server = srv;
    state = { port, token };
    lastByIp.clear();
    recent = [];
    return status();
  }

  function stop() {
    if (server) {
      server.close();
      server.closeAllConnections?.();
    }
    server = null;
    state = null;
    return { running: false };
  }

  return { start, stop, status };
}

module.exports = { createRoom };
