// Yazıdan sese: metni işletim sisteminin kendi sesleriyle WAV dosyasına çevirir (internet gerekmez).
// Windows: WinRT SpeechSynthesizer. Türkçe ses (Microsoft Tolga) Türkçe dil paketiyle gelir ve yalnızca
// WinRT'de görünür; eski SAPI (System.Speech) onu listelemez, bu yüzden WinRT kullanılıyor.
// Linux: espeak-ng (kuruluysa).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MAX_CHARS = 1000;
const TIMEOUT_MS = 30000;

// Metin ve ayarlar betiğe ortam değişkeniyle ve dosyayla gider, komut satırına hiç yazılmaz (tırnak/enjeksiyon derdi yok)
const PS_PRELUDE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`;

const PS_LIST = PS_PRELUDE + `
$list = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { @{ id = $_.Id; name = $_.DisplayName; lang = $_.Language; gender = [string]$_.Gender } })
ConvertTo-Json -InputObject $list -Compress
`;

const PS_SPEAK = PS_PRELUDE + `
$text = [IO.File]::ReadAllText($env:PADO_TTS_TEXT, [Text.Encoding]::UTF8)
$s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Id -eq $env:PADO_TTS_VOICE } | Select-Object -First 1
if ($v) { $s.Voice = $v }
try { $s.Options.SpeakingRate = [double]::Parse($env:PADO_TTS_RATE, [Globalization.CultureInfo]::InvariantCulture) } catch {}
try { $s.Options.AudioPitch = [double]::Parse($env:PADO_TTS_PITCH, [Globalization.CultureInfo]::InvariantCulture) } catch {}
$stream = Await ($s.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
$n = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
$bytes = New-Object byte[] $n
$reader.ReadBytes($bytes)
[IO.File]::WriteAllBytes($env:PADO_TTS_OUT, $bytes)
`;

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Seslendirme zaman aşımına uğradı')); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().split('\n').slice(-3).join(' ') || `çıkış kodu ${code}`));
    });
  });
}

const powershell = (script, env) =>
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], env);

// Önce Türkçe sesler, sonra diğerleri
const sortVoices = (voices) => [...voices].sort((a, b) => (b.lang?.startsWith('tr') ? 1 : 0) - (a.lang?.startsWith('tr') ? 1 : 0));

/** Dönen: { voices: [{ id, name, lang }], engine, hint? } — ses yoksa hint kullanıcıya ne yapacağını söyler. */
async function listVoices() {
  if (process.platform === 'win32') {
    const raw = await powershell(PS_LIST);
    const parsed = JSON.parse(raw.trim() || '[]');
    const voices = sortVoices((Array.isArray(parsed) ? parsed : [parsed]).filter((v) => v && v.id));
    const hasTr = voices.some((v) => v.lang?.startsWith('tr'));
    return {
      engine: 'windows', voices,
      hint: hasTr ? null : 'Türkçe ses kurulu değil. Ayarlar → Saat ve dil → Konuşma → Ses ekle → Türkçe.',
    };
  }
  if (process.platform === 'linux') {
    try {
      await run('espeak-ng', ['--version']);
    } catch (_) {
      return { engine: 'none', voices: [], hint: 'espeak-ng kurulu değil. Debian/Ubuntu: sudo apt install espeak-ng' };
    }
    return { engine: 'espeak', voices: [{ id: 'tr', name: 'eSpeak Türkçe', lang: 'tr' }, { id: 'en', name: 'eSpeak English', lang: 'en' }] };
  }
  return { engine: 'none', voices: [], hint: 'Bu sistemde seslendirme desteklenmiyor.' };
}

const clampNum = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);

/**
 * Metni outDir içine WAV olarak yazar. Dönen: dosya yolu.
 * rate: 0.5–2 (1 normal), pitch: 0.5–1.5 (1 normal).
 */
async function synthesize({ text, voiceId, rate, pitch }, outDir) {
  const clean = String(text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, MAX_CHARS);
  if (!clean) throw new Error('Seslendirilecek metin boş');
  const r = clampNum(rate, 0.5, 2, 1);
  const p = clampNum(pitch, 0.5, 1.5, 1);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outPath = path.join(outDir, `seslendirme-${stamp}.wav`);
  const textPath = path.join(outDir, `metin-${stamp}.txt`);
  fs.writeFileSync(textPath, clean, 'utf-8');
  try {
    if (process.platform === 'win32') {
      await powershell(PS_SPEAK, {
        PADO_TTS_TEXT: textPath, PADO_TTS_OUT: outPath, PADO_TTS_VOICE: String(voiceId || ''),
        PADO_TTS_RATE: String(r), PADO_TTS_PITCH: String(p),
      });
    } else if (process.platform === 'linux') {
      const voice = /^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(voiceId || '') ? voiceId : 'tr';
      // espeak-ng: hız dakikada kelime (175 normal), ton 0–99 (50 normal)
      await run('espeak-ng', ['-v', voice, '-s', String(Math.round(175 * r)), '-p', String(Math.round(50 * p)), '-w', outPath, '-f', textPath]);
    } else {
      throw new Error('Bu sistemde seslendirme desteklenmiyor');
    }
  } finally {
    try { fs.unlinkSync(textPath); } catch (_) { /* yoksa geç */ }
  }
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 100) throw new Error('Ses dosyası oluşmadı');
  return outPath;
}

/** Önceki oturumlardan kalan geçici seslendirme dosyalarını siler. */
function cleanup(outDir) {
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) { /* kullanımdaysa sonra */ }
}

module.exports = { listVoices, synthesize, cleanup, MAX_CHARS };
