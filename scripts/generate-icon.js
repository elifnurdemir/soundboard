const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function createPNG(size, drawFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; ihdrData[9] = 6; // RGBA

  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawFn(x, y, size);
      const i = y * (1 + size * 4) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a ?? 255;
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Pad layout config (for 256x256 base)
const PAD_COUNT = 4;
const PAD_SIZE = 50;
const GAP = 9;
const OFFSET = 15;
const RADIUS = 7;

// Which pads get which color (row, col)
// 0 = background, 1 = lime, 2 = medium, 3 = dim
const PAD_COLORS = [
  [1, 3, 2, 3],
  [3, 1, 3, 2],
  [2, 3, 1, 3],
  [3, 2, 3, 1],
];

const COLORS = {
  bg:     [11,  13,  11,  255],
  lime:   [196, 255,  0,  255],
  limeHi: [220, 255, 100, 255],
  medium: [30,  68,  30,  255],
  dim:    [16,  26,  16,  255],
};

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function lerpColor(c1, c2, t) {
  return [lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t), lerp(c1[3],c2[3],t)];
}

function drawIcon(x, y, size) {
  const s = size / 256;
  const padSize = PAD_SIZE * s;
  const gap = GAP * s;
  const offset = OFFSET * s;
  const radius = RADIUS * s;

  for (let row = 0; row < PAD_COUNT; row++) {
    for (let col = 0; col < PAD_COUNT; col++) {
      const px = offset + col * (padSize + gap);
      const py = offset + row * (padSize + gap);

      if (x < px || x >= px + padSize || y < py || y >= py + padSize) continue;

      const rx = x - px;
      const ry = y - py;

      // Rounded corners via SDF
      const cx = Math.max(radius - rx, rx - (padSize - radius - 1), 0);
      const cy = Math.max(radius - ry, ry - (padSize - radius - 1), 0);
      if (cx * cx + cy * cy > radius * radius) continue;

      const type = PAD_COLORS[row][col];
      if (type === 1) {
        // Lime pad with subtle top-left highlight
        const highlightT = Math.max(0, 1 - (rx / padSize) * 2.5) * Math.max(0, 1 - (ry / padSize) * 2.5) * 0.5;
        return lerpColor(COLORS.lime, COLORS.limeHi, highlightT);
      }
      if (type === 2) return COLORS.medium;
      return COLORS.dim;
    }
  }

  return COLORS.bg;
}

// Convert pixel draw function output to BMP DIB (no file header) for ICO embedding
function createBMPDIB(size, drawFn) {
  // BITMAPINFOHEADER — 40 bytes
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0);       // biSize
  hdr.writeInt32LE(size, 4);      // biWidth
  hdr.writeInt32LE(size * 2, 8);  // biHeight (doubled — includes AND mask)
  hdr.writeUInt16LE(1, 12);       // biPlanes
  hdr.writeUInt16LE(32, 14);      // biBitCount
  // rest zero (BI_RGB, no compression)

  // Pixel data: BGRA, bottom-up
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a = 255] = drawFn(x, y, size);
      const idx = ((size - 1 - y) * size + x) * 4;
      pixels[idx]     = b;
      pixels[idx + 1] = g;
      pixels[idx + 2] = r;
      pixels[idx + 3] = a;
    }
  }

  // AND mask: all zeros (opaque), bottom-up, rows padded to 4 bytes
  const rowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(size * rowBytes, 0);

  return Buffer.concat([hdr, pixels, mask]);
}

function createICO(sizes, drawFn) {
  const images = sizes.map(size => ({ size, data: createBMPDIB(size, drawFn) }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let dataOffset = 6 + images.length * 16;
  const dirs = images.map(({ size, data }) => {
    const dir = Buffer.alloc(16);
    dir[0] = size >= 256 ? 0 : size;
    dir[1] = size >= 256 ? 0 : size;
    dir[2] = 0; dir[3] = 0;
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(data.length, 8);
    dir.writeUInt32LE(dataOffset, 12);
    dataOffset += data.length;
    return dir;
  });

  return Buffer.concat([header, ...dirs, ...images.map(i => i.data)]);
}

const icoSizes = [16, 32, 48, 64, 128, 256];
const ico = createICO(icoSizes, drawIcon);
const png256 = createPNG(256, drawIcon);

const root = path.join(__dirname, '..');

// build-assets — used by electron-builder
fs.mkdirSync(path.join(root, 'build-assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'build-assets', 'icon.png'), png256);
fs.writeFileSync(path.join(root, 'build-assets', 'icon.ico'), ico);

// electron/ — bundled in asar, used by main.js at runtime
fs.writeFileSync(path.join(root, 'electron', 'icon.ico'), ico);
fs.writeFileSync(path.join(root, 'electron', 'icon.png'), png256);

// public/ — served by Vite, used by React UI
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'icon.png'), png256);

console.log('✓ build-assets/icon.ico');
console.log('✓ electron/icon.ico');
console.log('✓ public/icon.png');
