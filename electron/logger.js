const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

// Yerel hata günlüğü. Hiçbir yere gönderilmez; kullanıcı isterse "Sorun bildir" ile kendisi paylaşır.
const MAX_BYTES = 1024 * 1024;
const REPO = 'elifnurdemir/soundboard';
const seen = new Set(); // aynı hata bu oturumda tekrar yazılmasın

let file = null;
const logFile = () => {
  if (!file) file = path.join(app.getPath('userData'), 'logs', 'padoboard.log');
  return file;
};

// Yığın izlerindeki kullanıcı adı / ev klasörü paylaşılmasın
const scrub = (s) => String(s ?? '').split(os.homedir()).join('~');

function write(level, text) {
  try {
    const f = logFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > MAX_BYTES) fs.renameSync(f, `${f}.old`); } catch (_) { /* dosya henüz yok */ }
    fs.appendFileSync(f, `${new Date().toISOString()} [${level}] ${scrub(text)}\n`);
  } catch (_) { /* günlük yazmak uygulamayı asla çökertmemeli */ }
}

function error(context, message, stack) {
  const key = `${context}:${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  write('error', `${context}: ${message}${stack ? `\n${stack}` : ''}`);
}

function tail(lines = 12) {
  try {
    return fs.readFileSync(logFile(), 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch (_) { return ''; }
}

function issueUrl() {
  const body = [
    '**Ne oldu?**',
    '',
    '',
    '**Nasıl tekrar edilir?**',
    '',
    '',
    '---',
    `Sürüm: ${app.getVersion()}`,
    `Sistem: ${os.type()} ${os.release()} (${process.arch})`,
    `Electron: ${process.versions.electron}`,
    '',
    '<details><summary>Son günlük satırları</summary>',
    '',
    '```',
    tail(12).slice(-2500) || '(günlük boş)',
    '```',
    '</details>',
  ].join('\n');
  return `https://github.com/${REPO}/issues/new?body=${encodeURIComponent(body)}`;
}

module.exports = { write, error, tail, issueUrl, dir: () => path.dirname(logFile()) };
