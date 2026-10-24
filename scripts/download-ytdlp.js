const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap-plus').default;

// Windows: yt-dlp.exe, Linux/macOS: yt-dlp (çalıştırılabilir izniyle)
const fileName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const destDir = path.join(__dirname, '..', 'electron', 'bin');
const destPath = path.join(destDir, fileName);

async function main() {
  if (fs.existsSync(destPath)) {
    console.log(fileName + ' zaten mevcut, atlanıyor:', destPath);
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  console.log(fileName + ' indiriliyor...');
  await YTDlpWrap.downloadFromGithub(destPath, undefined, process.platform);
  console.log(fileName + ' indirildi:', destPath);
}

main().catch((err) => {
  console.error('yt-dlp indirilemedi (YouTube linki özelliği devre dışı kalacak):', err.message);
});
