import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { buildPack, readPack, PackError } = require('./pack.js');

let root, src, soundsDir, imagesDir;
const touch = (dir, name, content = 'ses') => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
};
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const zipWith = (manifest, extra = {}) => {
  const zip = new AdmZip();
  if (manifest !== undefined) zip.addFile('manifest.json', Buffer.from(typeof manifest === 'string' ? manifest : JSON.stringify(manifest)));
  for (const [name, data] of Object.entries(extra)) zip.addFile(name, Buffer.from(data));
  return zip.toBuffer();
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'padoboard-pack-'));
  src = path.join(root, 'src');
  soundsDir = path.join(root, 'sounds');
  imagesDir = path.join(root, 'images');
  fs.mkdirSync(src);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('buildPack + readPack', () => {
  it('kategori, ses, görsel ve ayarlar paketten aynen geri gelir', () => {
    const a = touch(src, 'korna.mp3', 'KORNA');
    const img = touch(src, 'korna.png', 'PNG');
    const b = touch(src, 'alkis.wav', 'ALKIS');
    const { buffer, count, skipped } = buildPack({
      category: { name: 'Oyun', color: '#123456' },
      sounds: [
        { name: 'Korna', filePath: a, image: img, volume: 0.5, loop: true, trimStart: 1, trimEnd: 2.5, color: '#abcdef', shortcut: 'F1', chatCommand: '!korna', favorite: true, playCount: 99 },
        { name: 'Alkış', filePath: b },
        { name: 'Kayıp', filePath: path.join(src, 'yok.mp3') },
      ],
      appVersion: '1.0.24',
    });
    expect(count).toBe(2);
    expect(skipped).toBe(1);

    const out = readPack(buffer, { soundsDir, imagesDir });
    expect(out.category).toEqual({ name: 'Oyun', color: '#123456' });
    expect(out.sounds).toHaveLength(2);
    const [k, al] = out.sounds;
    expect(k).toMatchObject({ name: 'Korna', volume: 0.5, loop: true, trimStart: 1, trimEnd: 2.5, color: '#abcdef' });
    expect(fs.readFileSync(k.filePath, 'utf-8')).toBe('KORNA');
    expect(fs.readFileSync(k.image, 'utf-8')).toBe('PNG');
    expect(path.dirname(k.filePath)).toBe(soundsDir);
    expect(path.dirname(k.image)).toBe(imagesDir);
    expect(fs.readFileSync(al.filePath, 'utf-8')).toBe('ALKIS');
    expect(al.image).toBe('');
    // Kişisel alanlar paylaşılmaz
    for (const key of ['shortcut', 'chatCommand', 'favorite', 'playCount', 'id']) expect(k).not.toHaveProperty(key);
  });

  it('aynı adlı dosya varsa üzerine yazmaz, yeni ad verir', () => {
    fs.mkdirSync(soundsDir);
    touch(soundsDir, 'Korna.mp3', 'ESKI');
    const { buffer } = buildPack({ category: { name: 'X' }, sounds: [{ name: 'Korna', filePath: touch(src, 'k.mp3', 'YENI') }] });
    const out = readPack(buffer, { soundsDir, imagesDir });
    expect(fs.readFileSync(path.join(soundsDir, 'Korna.mp3'), 'utf-8')).toBe('ESKI');
    expect(path.basename(out.sounds[0].filePath)).toBe('Korna_1.mp3');
  });
});

describe('readPack güvenilmeyen paketlere karşı', () => {
  it('zip olmayan, manifestsiz ya da başka biçimdeki dosyayı reddeder', () => {
    expect(() => readPack(Buffer.from('zip değil'), { soundsDir, imagesDir })).toThrow(PackError);
    expect(() => readPack(zipWith(undefined, { 'a.mp3': 'x' }), { soundsDir, imagesDir })).toThrow(/manifest/);
    expect(() => readPack(zipWith('{bozuk'), { soundsDir, imagesDir })).toThrow(/bozuk/);
    expect(() => readPack(zipWith({ version: 1, sounds: [] }), { soundsDir, imagesDir })).toThrow(PackError);
    expect(() => readPack(zipWith({ format: 'padopack', version: 99, sounds: [] }), { soundsDir, imagesDir })).toThrow(/yeni/);
  });

  it('yol kaçırma (zip-slip) denemelerinde klasör dışına dosya yazmaz', () => {
    const evil = {
      format: 'padopack', version: 1, name: 'Kötü',
      sounds: [
        { name: '../../kacti', file: '../kacti.mp3' },
        { name: 'mutlak', file: 'C:/Windows/kacti.mp3' },
        { name: 'alt', file: 'sounds/../../kacti.mp3' },
        { name: 'exe', file: 'sounds/1.exe' },
        { name: '..\\..\\İyi/ad', file: 'sounds/2.mp3', image: 'images/../../x.png' },
      ],
    };
    const buf = zipWith(evil, { '../kacti.mp3': 'x', 'sounds/1.exe': 'MZ', 'sounds/2.mp3': 'OK' });
    const out = readPack(buf, { soundsDir, imagesDir });
    expect(out.sounds).toHaveLength(1);
    expect(path.dirname(out.sounds[0].filePath)).toBe(soundsDir);
    expect(path.basename(out.sounds[0].filePath)).toBe('....İyiad.mp3');
    expect(out.sounds[0].image).toBe('');
    expect(files(root).sort()).toEqual(['images', 'sounds', 'src']);
    expect(files(soundsDir)).toEqual(['....İyiad.mp3']);
  });

  it('ayarları sınırlar, geçersiz değerleri varsayılana çeker', () => {
    const buf = zipWith({
      format: 'padopack', version: 1, name: 'x'.repeat(500), color: 'javascript:alert(1)',
      sounds: [{ name: 'a', file: 'sounds/1.mp3', volume: 50, playbackRate: 'hızlı', trimStart: 5, trimEnd: 2, loop: 'evet', color: 'red', credit: { title: 't', evil: 'x' } }],
    }, { 'sounds/1.mp3': 'x' });
    const out = readPack(buf, { soundsDir, imagesDir });
    expect(out.category.name).toHaveLength(80);
    expect(out.category.color).toBeNull();
    expect(out.sounds[0]).toMatchObject({ volume: 1, playbackRate: 1, trimStart: 5, trimEnd: null, loop: false, credit: { title: 't' } });
    expect(out.sounds[0]).not.toHaveProperty('color');
    expect(out.sounds[0].credit).not.toHaveProperty('evil');
  });

  it('içinde hiç geçerli ses yoksa hata verir ve dosya bırakmaz', () => {
    const buf = zipWith({ format: 'padopack', version: 1, sounds: [{ name: 'a', file: 'sounds/9.mp3' }] });
    expect(() => readPack(buf, { soundsDir, imagesDir })).toThrow(/ses yok/);
    expect(files(soundsDir)).toEqual([]);
  });
});
