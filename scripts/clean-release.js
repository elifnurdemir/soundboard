const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '..', 'release');
if (!fs.existsSync(releaseDir)) process.exit(0);

const files = fs.readdirSync(releaseDir);
let deleted = 0;

for (const file of files) {
  if (file.endsWith('.exe') || file.endsWith('.exe.blockmap') || file.endsWith('.nsis.7z')) {
    fs.unlinkSync(path.join(releaseDir, file));
    deleted++;
  }
}

if (deleted > 0) console.log(`✓ Eski ${deleted} dosya silindi`);
