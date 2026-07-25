const path = require('path');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');

const destDir = path.join(__dirname, '..', 'electron', 'bin', 'vbcable');
const zipUrl = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip';

function download(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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
    console.log('VB-CABLE zaten mevcut, atlanıyor:', destDir);
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  console.log('VB-CABLE indiriliyor...');
  const buf = await download(zipUrl);
  const zip = new AdmZip(buf);
  zip.extractAllTo(destDir, true);
  fs.writeFileSync(marker, new Date().toISOString());
  console.log('VB-CABLE indirildi ve açıldı:', destDir);
  console.log('İçerik:', fs.readdirSync(destDir).join(', '));
}

main().catch((err) => {
  console.error('VB-CABLE indirilemedi (sanal kablo özelliği devre dışı kalacak):', err.message);
});
