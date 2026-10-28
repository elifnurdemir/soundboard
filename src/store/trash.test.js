import { describe, it, expect } from 'vitest';
import { TRASH_MS, splitExpired, daysLeft, unreferencedFiles, orphanToSound, formatSize } from './trash.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('splitExpired', () => {
  it('30 günü dolanları ayırır, dolmayanları tutar', () => {
    const trash = [
      { trashId: 'old', deletedAt: NOW - 31 * DAY },
      { trashId: 'edge', deletedAt: NOW - TRASH_MS },
      { trashId: 'new', deletedAt: NOW - 29 * DAY },
    ];
    const { expired, kept } = splitExpired(trash, NOW);
    expect(expired.map((t) => t.trashId)).toEqual(['old', 'edge']);
    expect(kept.map((t) => t.trashId)).toEqual(['new']);
  });
});

describe('daysLeft', () => {
  it('kalan günü yukarı yuvarlar, eksiye düşmez', () => {
    expect(daysLeft({ deletedAt: NOW }, NOW)).toBe(30);
    expect(daysLeft({ deletedAt: NOW - 29.5 * DAY }, NOW)).toBe(1);
    expect(daysLeft({ deletedAt: NOW - 90 * DAY }, NOW)).toBe(0);
  });
});

describe('unreferencedFiles', () => {
  const snd = (id, filePath, image) => ({ id, filePath, image });

  it('başka sesin kullanmadığı dosyaları döner', () => {
    const removed = [snd('1', 'C:\\s\\a.mp3', 'C:\\i\\a.png')];
    expect(unreferencedFiles(removed, [snd('2', 'C:\\s\\b.mp3')])).toEqual(['C:\\s\\a.mp3', 'C:\\i\\a.png']);
  });

  it('aynı dosyayı kullanan başka ses varsa dosyayı korur (yazım farkı olsa da)', () => {
    const removed = [snd('1', 'C:\\s\\ortak.mp3')];
    const stillUsed = [snd('2', 'c:/S/ORTAK.mp3')];
    expect(unreferencedFiles(removed, stillUsed)).toEqual([]);
  });

  it('görseli de ayrı ayrı korur', () => {
    const removed = [snd('1', 'C:\\s\\a.mp3', 'C:\\i\\ortak.png')];
    const stillUsed = [snd('2', 'C:\\s\\b.mp3', 'C:\\i\\ortak.png')];
    expect(unreferencedFiles(removed, stillUsed)).toEqual(['C:\\s\\a.mp3']);
  });

  it('silinen iki ses aynı dosyayı paylaşıyorsa dosyayı bir kez listeler', () => {
    const removed = [snd('1', 'C:\\s\\a.mp3'), snd('2', 'C:\\s\\a.mp3')];
    expect(unreferencedFiles(removed, [])).toEqual(['C:\\s\\a.mp3']);
  });

  it('dosyası olmayan sesi sorun etmez', () => {
    expect(unreferencedFiles([snd('1', '', undefined)], [])).toEqual([]);
  });
});

describe('orphanToSound', () => {
  it('dosya adından ses adı çıkarır', () => {
    expect(orphanToSound({ name: 'Helal.mp3', path: 'C:\\s\\Helal.mp3' }, 'id1')).toEqual({
      id: 'id1', name: 'Helal', filePath: 'C:\\s\\Helal.mp3',
    });
  });
});

describe('formatSize', () => {
  it('okunur boyut yazar', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
