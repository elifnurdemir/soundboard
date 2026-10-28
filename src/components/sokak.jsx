import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
// Yazı tipi uygulamaya paketlenir (çevrimdışı çalışır). İki alt küme birlikte tüm Türkçe harfleri kapsar.
import '@fontsource/rubik-wet-paint/latin-400.css';
import '@fontsource/rubik-wet-paint/latin-ext-400.css';
import './sokak.css';
import { splitTitle } from '../store/sokak';

const FONT_CHECK = '40px "Rubik Wet Paint"';
const TR_SAMPLE = 'ĞŞİığşÖöÜüÇç';

// Tuğla deseni ve kenar karartması bir kez tanımlanır (App içinde), butonlar url(#...) ile kullanır
export function SokakDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="sokak-brk" width="40" height="20" patternUnits="userSpaceOnUse">
          <rect width="40" height="20" fill="#6d3022" />
          <path d="M0 0H40M0 10H40M0 20H40M0 0V10M20 0V10M10 10V20M30 10V20" stroke="#2a130e" strokeWidth="1.6" fill="none" />
          <rect x="3" y="3" width="6" height="2" fill="#86402e" opacity=".6" />
          <rect x="24" y="13" width="7" height="2" fill="#86402e" opacity=".6" />
          <rect x="31" y="4" width="5" height="2" fill="#5a2619" opacity=".7" />
        </pattern>
        <radialGradient id="sokak-vig" cx="50%" cy="50%" r="72%">
          <stop offset="52%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".7" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function SokakWall({ dx, dy }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g transform={`translate(${dx} ${dy})`}><rect x="-40" y="-40" width="180" height="180" fill="url(#sokak-brk)" /></g>
      <rect width="100" height="100" fill="url(#sokak-vig)" />
    </svg>
  );
}

// Başlık buton genişliğine göre otomatik sığar: kısa ve uzun başlıklar aynı en büyük boyutu paylaşır.
// Boyut cqw cinsinden yazılır, bu yüzden buton küçülüp büyüyünce yeniden hesaplamak gerekmez.
export function SprayTitle({ text, color, rot }) {
  const ref = useRef(null);
  const upper = String(text || '').toLocaleUpperCase('tr-TR');
  const lines = splitTitle(upper);

  const fit = useCallback(() => {
    const el = ref.current;
    const host = el && el.closest('.sokak-btn');
    const W = host ? host.clientWidth : 0;
    if (!el || !W) return;
    el.style.fontSize = '100px';
    const w = el.offsetWidth || 1;
    const px = Math.max(W * 0.07, Math.min(W * 0.27, (100 * W * 0.84) / w));
    el.style.fontSize = `${((px / W) * 100).toFixed(2)}cqw`;
  }, []);

  useLayoutEffect(() => { fit(); }, [fit, upper]);

  // Yazı tipi yüklenince ölçü değişir, buton boyutu 0'dan gerçek değere geçebilir (gizli bölüm, ilk yerleşim):
  // ikisinde de yeniden sığdır
  useEffect(() => {
    let off = false;
    document.fonts?.load(FONT_CHECK, TR_SAMPLE).then(() => { if (!off) fit(); }).catch(() => {});
    const host = ref.current && ref.current.closest('.sokak-btn');
    let ro;
    if (host && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => fit());
      ro.observe(host);
    }
    return () => { off = true; ro?.disconnect(); };
  }, [fit, upper]);

  return (
    <span ref={ref} className="sokak-t" lang="tr" style={{ color, transform: `rotate(${rot.toFixed(1)}deg)` }}>
      {lines.map((l, i) => <span key={i}>{l}</span>)}
    </span>
  );
}
