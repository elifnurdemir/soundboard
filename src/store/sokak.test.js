import { describe, it, expect } from 'vitest';
import { SOKAK_PALETTE, SOKAK_ROT, assignSokak, splitTitle, hashId } from './sokak.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `ses-${i}-${i * 7919}`);

describe('assignSokak', () => {
  it('komşu butonlar (sol, üst, sol üst) aynı rengi almaz, her sütun sayısında', () => {
    for (const cols of [1, 2, 3, 4, 5, 6, 8, 12, 20]) {
      const a = assignSokak(ids(60), cols);
      a.forEach((t, i) => {
        if (cols === 1) { if (i > 0) expect(t.pi).not.toBe(a[i - 1].pi); return; }
        if (i % cols > 0) expect(t.pi, `sol komşu, ${cols} sütun, #${i}`).not.toBe(a[i - 1].pi);
        if (i >= cols) expect(t.pi, `üst komşu, ${cols} sütun, #${i}`).not.toBe(a[i - cols].pi);
        if (i >= cols && i % cols > 0) expect(t.pi, `sol üst, ${cols} sütun, #${i}`).not.toBe(a[i - cols - 1].pi);
      });
    }
  });

  it('aynı girdi her zaman aynı sonucu verir', () => {
    expect(assignSokak(ids(30), 5)).toEqual(assignSokak(ids(30), 5));
  });

  it('eğim 2 ile 6 derece arasındadır ve iki yöne de eğilir', () => {
    const a = assignSokak(ids(80), 5);
    a.forEach((t) => {
      expect(Math.abs(t.rot)).toBeGreaterThanOrEqual(SOKAK_ROT[0]);
      expect(Math.abs(t.rot)).toBeLessThanOrEqual(SOKAK_ROT[1]);
    });
    expect(a.some((t) => t.rot < 0)).toBe(true);
    expect(a.some((t) => t.rot > 0)).toBe(true);
  });

  it('palet dengeli dağılır', () => {
    const a = assignSokak(ids(100), 5);
    const counts = SOKAK_PALETTE.map((_, k) => a.filter((t) => t.pi === k).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
  });

  it('renk paletin içinden gelir, duvar kayması sınırlar içindedir', () => {
    assignSokak(ids(40), 4).forEach((t) => {
      expect(SOKAK_PALETTE).toContain(t.color);
      expect(t.dx).toBeGreaterThanOrEqual(0); expect(t.dx).toBeLessThan(40);
      expect(t.dy).toBeGreaterThanOrEqual(0); expect(t.dy).toBeLessThan(20);
    });
  });

  it('boş listeyle çökmez', () => {
    expect(assignSokak([], 5)).toEqual([]);
  });
});

describe('splitTitle', () => {
  it('kısa ya da tek sözcüklü başlığı bölmez', () => {
    expect(splitTitle('HELAL')).toEqual(['HELAL']);
    expect(splitTitle('VAY BE')).toEqual(['VAY BE']);
    expect(splitTitle('SESSİZLİK')).toEqual(['SESSİZLİK']);
  });

  it('uzun başlığı dengeli iki satıra böler', () => {
    expect(splitTitle('AMAN ALLAHIM')).toEqual(['AMAN', 'ALLAHIM']);
    expect(splitTitle('OLMAZ BÖYLE İŞ')).toEqual(['OLMAZ', 'BÖYLE İŞ']);
    expect(splitTitle('ŞAKA ŞAKA')).toEqual(['ŞAKA', 'ŞAKA']);
  });

  it('fazla boşlukları temizler', () => {
    expect(splitTitle('  vay   be  ')).toEqual(['vay be']);
    expect(splitTitle('  yok   artık  ')).toEqual(['yok', 'artık']);
  });
});

describe('hashId', () => {
  it('kararlıdır ve farklı kimlikler için farklıdır', () => {
    expect(hashId('abc')).toBe(hashId('abc'));
    expect(hashId('abc')).not.toBe(hashId('abd'));
  });
});
