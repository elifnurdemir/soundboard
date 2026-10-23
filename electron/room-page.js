// Arkadaşların tarayıcıda gördüğü sayfa. Tek dosya, harici kaynak yok.
// Ses isimleri textContent ile yazılır (innerHTML yok) — XSS'e kapalı.
const ROOM_PAGE = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Soundboard Odası</title>
<style>
  :root { --bg:#0b0d0b; --surface:#131713; --border:#1e231e; --text:#e8efe6; --muted:#5c665a; --accent:#c4ff00; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.4 ui-monospace,Consolas,monospace; padding:16px; padding-bottom:40px; }
  h1 { font-size:12px; letter-spacing:.14em; color:var(--accent); margin:0 0 12px; text-transform:uppercase; }
  .row { display:flex; gap:8px; margin-bottom:12px; }
  input { flex:1; min-width:0; background:var(--surface); border:1px solid var(--border); color:var(--text); padding:10px 12px; font:inherit; outline:none; }
  input:focus { border-color:var(--accent); }
  .cats { display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; margin-bottom:10px; }
  .cat { flex:none; background:var(--surface); border:1px solid var(--border); color:var(--muted); padding:6px 10px; font:inherit; font-size:11px; cursor:pointer; }
  .cat.on { color:var(--bg); background:var(--accent); border-color:var(--accent); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:8px; }
  .snd { border:1px solid rgba(255,255,255,.08); color:#fff; padding:16px 8px; min-height:72px; font:inherit; font-weight:700; cursor:pointer; word-break:break-word; transition:transform .08s, opacity .2s; }
  .snd:active { transform:scale(.96); }
  .snd.cool { opacity:.35; pointer-events:none; }
  #msg { min-height:18px; font-size:12px; color:var(--muted); margin-bottom:8px; }
  #msg.err { color:#ff6b6b; }
</style>
</head>
<body>
<h1>Soundboard Odası</h1>
<div class="row"><input id="who" placeholder="Adın" maxlength="24"></div>
<div class="row"><input id="q" placeholder="Ses ara..."></div>
<div class="cats" id="cats"></div>
<div id="msg"></div>
<div class="grid" id="grid"></div>
<script>
(function () {
  var token = new URLSearchParams(location.search).get('t') || '';
  var sounds = [], cats = [], activeCat = 'all', query = '';
  var whoEl = document.getElementById('who');
  var msg = document.getElementById('msg');
  try { whoEl.value = localStorage.getItem('room-who') || ''; } catch (e) {}
  whoEl.addEventListener('input', function () { try { localStorage.setItem('room-who', whoEl.value); } catch (e) {} });

  function say(text, err) { msg.textContent = text || ''; msg.className = err ? 'err' : ''; }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-room-token': token, 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Hata'); return j; });
    });
  }

  function renderCats() {
    var box = document.getElementById('cats');
    box.textContent = '';
    [{ id: 'all', name: 'Hepsi' }].concat(cats).forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'cat' + (c.id === activeCat ? ' on' : '');
      b.textContent = c.name;
      b.onclick = function () { activeCat = c.id; renderCats(); renderGrid(); };
      box.appendChild(b);
    });
  }

  function renderGrid() {
    var grid = document.getElementById('grid');
    grid.textContent = '';
    var q = query.toLowerCase();
    sounds.filter(function (s) {
      return (activeCat === 'all' || s.categoryId === activeCat) && (!q || s.name.toLowerCase().indexOf(q) !== -1);
    }).forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'snd';
      b.style.background = /^#[0-9a-fA-F]{3,8}$/.test(s.color || '') ? s.color : '#1a4e78';
      b.textContent = s.name;
      b.onclick = function () {
        b.classList.add('cool');
        setTimeout(function () { b.classList.remove('cool'); }, 1000);
        api('/api/play', { method: 'POST', body: JSON.stringify({ id: s.id, who: whoEl.value }) })
          .then(function () { say('▶ ' + s.name); })
          .catch(function (e) { say(e.message, true); });
      };
      grid.appendChild(b);
    });
  }

  document.getElementById('q').addEventListener('input', function (e) { query = e.target.value; renderGrid(); });

  function load() {
    api('/api/sounds').then(function (d) {
      sounds = d.sounds; cats = d.categories;
      if (activeCat !== 'all' && !cats.some(function (c) { return c.id === activeCat; })) activeCat = 'all';
      renderCats(); renderGrid(); say('');
    }).catch(function (e) { say(e.message, true); });
  }
  load();
  setInterval(load, 20000);
})();
</script>
</body>
</html>`;

module.exports = { ROOM_PAGE };
