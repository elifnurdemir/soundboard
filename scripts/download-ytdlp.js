const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap-plus').default;

const destDir = path.join(__dirname, '..', 'electron', 'bin');
const destPath = path.join(destDir, 'yt-dlp.exe');

async function main() {
  if (fs.existsSync(destPath)) {
    console.log('yt-dlp.exe zaten mevcut, atlanıyor:', destPath);
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  console.log('yt-dlp.exe indiriliyor...');
  await YTDlpWrap.downloadFromGithub(destPath, undefined, 'win32');
  console.log('yt-dlp.exe indirildi:', destPath);
}

main().catch((err) => {
  console.error('yt-dlp indirilemedi (YouTube linki özelliği devre dışı kalacak):', err.message);
});
