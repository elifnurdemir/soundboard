const path = require('path');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');

const destDir = path.join(__dirname, '..', 'electron', 'bin', 'svcl');
const zipUrl = 'https://www.nirsoft.net/utils/svcl-x64.zip';

function download(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(download(res.headers.location, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} — ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const marker = path.join(destDir, '.installed');
  if (fs.existsSync(marker)) {
    console.log('svcl zaten mevcut, atlanıyor:', destDir);
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  console.log('svcl indiriliyor...');
  const buf = await download(zipUrl);
  const zip = new AdmZip(buf);
  zip.extractAllTo(destDir, true);
  fs.writeFileSync(marker, new Date().toISOString());
  console.log('svcl indirildi ve açıldı:', destDir);
  console.log('İçerik:', fs.readdirSync(destDir).join(', '));
}

main().catch((err) => {
  console.error('svcl indirilemedi (uygulama ses yönlendirme özelliği devre dışı kalacak):', err.message);
});
