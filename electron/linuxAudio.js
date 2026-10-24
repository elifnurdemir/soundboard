const { execFile } = require('node:child_process');

// Linux ses yönlendirme: PulseAudio ve PipeWire (pipewire-pulse) için `pactl`.
// Windows'taki VB-CABLE + svcl işinin karşılığı. Sürücü ya da yönetici izni gerekmez:
//   • "padoboard" adında boş bir sink: Padoboard sesini buraya verir
//   • "padoboard_mic" sanal mikrofonu: sink'in monitörünü gerçek bir mikrofon olarak gösterir (Discord, Steam, OBS bunu seçer)
// Modüller yeniden başlatmada ya da oturum kapanınca kaybolur; uygulama açılışta gerekirse yeniden kurar.

const SINK = 'padoboard';
const MIC = 'padoboard_mic';

// Kendi sesimizi başka sese yönlendirmeyiz: sohbet uygulamalarını (yankı yapar) ve Padoboard'un kendisini dışarıda tut
const BLOCKLIST = new Set(['discord', 'discordcanary', 'discordptb', 'vesktop', 'webcord', 'teams', 'teams-for-linux', 'zoom', 'skype', 'slack', 'soundboard', 'padoboard']);

const run = (args) => new Promise((resolve, reject) => {
  execFile('pactl', args, { timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      const e = new Error(err.code === 'ENOENT' ? 'pactl bulunamadı. "pulseaudio-utils" paketini kur (PipeWire kullanıyorsan da pactl bu pakette).' : (stderr || err.message).trim());
      e.code = err.code;
      reject(e);
    } else resolve(stdout);
  });
});

// `pactl list short ...` çıktısı: sekmeyle ayrılmış satırlar
const parseShort = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('\t'));
const parseJson = (text) => { try { const v = JSON.parse(text); return Array.isArray(v) ? v : []; } catch (_) { return []; } };

const binaryOf = (input) => {
  const p = input.properties || {};
  return String(p['application.process.binary'] || p['application.name'] || '').trim();
};
const isBlocked = (binary) => BLOCKLIST.has(binary.toLowerCase());

async function status() {
  try {
    const [sinks, sources] = await Promise.all([run(['list', 'short', 'sinks']), run(['list', 'short', 'sources'])]);
    return {
      available: true,
      sink: parseShort(sinks).some((r) => r[1] === SINK),
      mic: parseShort(sources).some((r) => r[1] === MIC),
    };
  } catch (err) {
    return { available: false, sink: false, mic: false, error: err.message };
  }
}

// Sanal sink ve mikrofonu (yoksa) kurar
async function ensure() {
  const st = await status();
  if (!st.available) return { success: false, error: st.error };
  try {
    if (!st.sink) await run(['load-module', 'module-null-sink', `sink_name=${SINK}`, 'sink_properties=device.description="Padoboard"']);
    if (!st.mic) await run(['load-module', 'module-remap-source', `master=${SINK}.monitor`, `source_name=${MIC}`, 'source_properties=device.description="Padoboard Mikrofon"']);
    return { success: true, created: !st.sink || !st.mic };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function remove() {
  try {
    const mods = parseShort(await run(['list', 'short', 'modules']));
    for (const r of mods) {
      const args = r.slice(2).join(' ');
      if ((r[1] === 'module-remap-source' && args.includes(`source_name=${MIC}`)) || (r[1] === 'module-null-sink' && args.includes(`sink_name=${SINK}`))) {
        await run(['unload-module', r[0]]).catch(() => {});
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const defaultSink = async () => (await run(['get-default-sink'])).trim();

// sink indeksi → sink adı
async function sinkNames() {
  const map = new Map();
  for (const s of parseJson(await run(['--format=json', 'list', 'sinks']))) map.set(s.index, s.name);
  return map;
}

async function inputs() {
  const names = await sinkNames();
  return parseJson(await run(['--format=json', 'list', 'sink-inputs'])).map((i) => ({
    index: i.index,
    binary: binaryOf(i),
    name: (i.properties && i.properties['application.name']) || binaryOf(i),
    sink: names.get(i.sink) || '',
  }));
}

const sameApp = (input, exe) => input.binary.toLowerCase() === String(exe || '').toLowerCase();

async function listSessions() {
  const seen = new Set();
  const apps = [];
  for (const i of await inputs()) {
    const key = i.binary.toLowerCase();
    if (!key || isBlocked(i.binary) || seen.has(key)) continue;
    seen.add(key);
    apps.push({ exe: i.binary, name: i.name });
  }
  return apps;
}

// Uygulamanın tüm akışlarını Padoboard sink'ine taşır; önceki sink'in adını döndürür (geri alma için)
async function routeApp(exe) {
  if (isBlocked(exe || '')) return { success: false, error: 'Bu uygulama, sesin geri yankılanmasını önlemek için yönlendirilemez.' };
  const made = await ensure();
  if (!made.success) return made;
  const mine = (await inputs()).filter((i) => sameApp(i, exe));
  if (!mine.length) return { success: false, error: 'Bu uygulamanın şu an çalan bir sesi yok. Önce ses çaldır, sonra tekrar dene.' };
  const previousDeviceId = mine.find((i) => i.sink && i.sink !== SINK)?.sink || (await defaultSink());
  for (const i of mine) await run(['move-sink-input', String(i.index), SINK]);
  return { success: true, previousDeviceId };
}

async function restoreApp(exe, sinkName) {
  const target = sinkName && sinkName !== SINK ? sinkName : await defaultSink();
  const mine = (await inputs()).filter((i) => sameApp(i, exe) && i.sink === SINK);
  for (const i of mine) await run(['move-sink-input', String(i.index), target]);
  return { success: true };
}

// Padoboard sink'inde takılı kalmış (önceki oturumdan) akışları varsayılan çıkışa geri taşır
async function cleanup(excludeExes = new Set()) {
  const cleaned = [];
  try {
    const target = await defaultSink();
    for (const i of await inputs()) {
      if (i.sink !== SINK || !i.binary || isBlocked(i.binary) || excludeExes.has(i.binary.toLowerCase())) continue;
      try { await run(['move-sink-input', String(i.index), target]); cleaned.push(i.binary); } catch (_) { /* en iyi çaba */ }
    }
  } catch (_) { /* pactl yok ya da sunucu kapalı */ }
  return cleaned;
}

module.exports = { SINK, MIC, status, ensure, remove, listSessions, routeApp, restoreApp, cleanup, parseShort, parseJson, binaryOf, isBlocked };
