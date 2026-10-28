import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { deleteFiles, findOrphans, isInside } = require('./files.js');

let root, sounds, images, outside;
const touch = (dir, name, content = 'x') => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'padoboard-files-'));
  sounds = path.join(root, 'sounds');
  images = path.join(root, 'images');
  outside = path.join(root, 'user-files');
  [sounds, images, outside].forEach((d) => fs.mkdirSync(d));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('isInside', () => {
  it('klasör içindeki dosyayı tanır, dışındakini ve üst klasörü reddeder', () => {
    expect(isInside(sounds, path.join(sounds, 'a.mp3'))).toBe(true);
    expect(isInside(sounds, path.join(outside, 'a.mp3'))).toBe(false);
    expect(isInside(sounds, sounds)).toBe(false);
    expect(isInside(sounds, path.join(sounds, '..', 'user-files', 'a.mp3'))).toBe(false);
  });
});

describe('deleteFiles', () => {
  it('uygulama klasörlerindeki dosyaları siler', () => {
    const a = touch(sounds, 'a.mp3');
    const img = touch(images, 'a.png');
    const res = deleteFiles([sounds, images], [a, img]);
    expect(res.deleted).toHaveLength(2);
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(img)).toBe(false);
  });

  it('uygulama klasörü dışındaki dosyaya dokunmaz', () => {
    const mine = touch(outside, 'benim-sesim.mp3');
    const res = deleteFiles([sounds, images], [mine]);
    expect(res.deleted).toHaveLength(0);
    expect(res.skipped[0].reason).toBe('outside');
    expect(fs.existsSync(mine)).toBe(true);
  });

  it('.. ile klasörden kaçmaya çalışan yolu reddeder', () => {
    const mine = touch(outside, 'x.mp3');
    const sneaky = path.join(sounds, '..', 'user-files', 'x.mp3');
    deleteFiles([sounds], [sneaky]);
    expect(fs.existsSync(mine)).toBe(true);
  });

  it('klasörleri silmez', () => {
    const dir = path.join(sounds, 'alt');
    fs.mkdirSync(dir);
    const res = deleteFiles([sounds], [dir]);
    expect(res.skipped[0].reason).toBe('not-a-file');
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('olmayan dosyayı hata saymaz, geçersiz adresleri atlar', () => {
    const res = deleteFiles([sounds], [path.join(sounds, 'yok.mp3'), 'https://example.com/a.mp3', 'blob:abc', '']);
    expect(res.missing).toHaveLength(1);
    expect(res.skipped).toHaveLength(3);
    expect(res.failed).toHaveLength(0);
  });

  it('aynı dosya iki kez verilirse bir kez işler', () => {
    const a = touch(sounds, 'a.mp3');
    const res = deleteFiles([sounds], [a, a]);
    expect(res.deleted).toHaveLength(1);
  });
});

describe('findOrphans', () => {
  it('hiçbir sese bağlı olmayan ses dosyalarını bulur', () => {
    const used = touch(sounds, 'kullanilan.mp3');
    touch(sounds, 'yetim.mp3', 'abcd');
    const found = findOrphans(sounds, [used]);
    expect(found.map((f) => f.name)).toEqual(['yetim.mp3']);
    expect(found[0].size).toBe(4);
  });

  it('büyük/küçük harf ve ters eğik çizgi farkını bağlı sayar', () => {
    touch(sounds, 'Ses.MP3');
    const written = path.join(sounds, 'ses.mp3').replace(/\\/g, '/');
    expect(findOrphans(sounds, [written])).toEqual([]);
  });

  it('aynı dosya adı başka yoldan kayıtlıysa temkinli davranıp bağlı sayar', () => {
    touch(sounds, 'ayni.mp3');
    expect(findOrphans(sounds, [path.join('D:', 'eski-yer', 'ayni.mp3')])).toEqual([]);
  });

  it('ses olmayan dosyaları ve alt klasörleri listelemez', () => {
    touch(sounds, 'not.txt');
    touch(sounds, 'indirme.part');
    fs.mkdirSync(path.join(sounds, 'alt'));
    expect(findOrphans(sounds, [])).toEqual([]);
  });

  it('file:// adresiyle kayıtlı dosyayı bağlı sayar', () => {
    const p = touch(sounds, 'url.mp3');
    const url = 'file:///' + p.replace(/\\/g, '/');
    expect(findOrphans(sounds, [url])).toEqual([]);
  });

  it('klasör yoksa boş döner', () => {
    expect(findOrphans(path.join(root, 'yok'), [])).toEqual([]);
  });
});
