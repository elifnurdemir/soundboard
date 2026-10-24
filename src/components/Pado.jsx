import { useEffect, useState } from 'react';
import './pado.css';
import usePadoStore from '../store/usePadoStore';
import useSoundStore from '../store/useSoundStore';
import useCollageStore from '../store/useCollageStore';
import useOnlineStore from '../store/useOnlineStore';

// Pado — Soundboard'un maskotu. Gerçek CSS 3D: gövde perspektif içinde döner, katmanlar farklı derinlikte durur.
// Ağzı yok: duygu gözlerden, kaşlardan ve etrafındaki işaretlerden gelir. Çizim koordinatları kafa merkezine göre (0,0).

const W = 860;
const H = 720;
const MAIN = 'var(--pd-main)';

export const LABEL = {
  idle: 'bekliyor', playing: 'çalıyor', recording: 'kayıtta', editing: 'düzenliyor',
  working: 'birleştiriyor', searching: 'arıyor', sleeping: 'uyuyor', alarm: 'dikkat', celebrate: 'kutluyor',
};

const D = ({ c, s, children }) => <div className={c} style={{ position: 'absolute', ...s }}>{children}</div>;
const Layer = ({ z, children }) => <div className="pd-l" style={{ transform: `translateZ(${z}px)` }}>{children}</div>;

const Cup = ({ m }) => {
  const X = (x, w) => (m < 0 ? x : -x - w); // sol taraftaki kutuyu sağa yansıt
  return (
    <>
      <D s={{ left: X(-353, 56), top: -85, width: 56, height: 187, borderRadius: 28, background: '#2a302a' }} />
      <D s={{ left: X(-417, 74), top: -118, width: 74, height: 252, borderRadius: 37, background: '#e9efe7' }} />
      <D s={{ left: X(-403, 47), top: -65, width: 47, height: 147, borderRadius: 24, background: MAIN }} />
      <D s={{ left: m * 380 - 9, top: 0, width: 18, height: 18, borderRadius: 9, background: '#0b0d0b' }} />
    </>
  );
};

const eyeBox = (c, x, w = 173, h = 184, y = -88, r = 57) => <D c={c} s={{ left: x, top: y, width: w, height: h, borderRadius: r, background: MAIN }} />;
const pupil = (c, x) => <D c={c} s={{ left: x, top: -48, width: 97, height: 110, borderRadius: 43, background: '#0b0d0b', opacity: 0.62 }} />;
const arc = (x) => <D s={{ left: x, top: -16, width: 153, height: 90, boxSizing: 'border-box', borderTop: `36px solid ${MAIN}`, borderRadius: '90px 90px 0 0' }} />;
const line = (x) => <D s={{ left: x, top: -7, width: 104, height: 22, borderRadius: 11, background: MAIN }} />;
// hidden: tek seferlik "kaş kaldır" hareketi için (animasyon görünür kılar); alarmdaki kaşlar kapsayıcıyla görünür olur
const brow = (c, x, rot, hidden) => <D c={c} s={{ left: x, top: -150, width: 160, height: 26, borderRadius: 13, background: MAIN, opacity: hidden ? 0 : undefined, transform: rot ? `rotate(${rot}deg)` : undefined }} />;

export default function Pado({ mood = 'idle', size = 160, gesture = null, onClick, title, className = '' }) {
  const k = size / W;
  return (
    <div
      className={`pd pd-m-${mood}${gesture ? ` pd-g-${gesture}` : ''} ${className}`}
      style={{ width: W * k, height: H * k }}
      onClick={onClick}
      title={title}
      role="img"
      aria-label={`Pado, ${LABEL[mood] || mood}`}
    >
      <div className="pd-stage" style={{ transform: `scale(${k})` }}>
        <div className="pd-persp">
          <div className="pd-sh" />
          <div className="pd-rings"><i /><i /><i /></div>

          <div className="pd-body">
            <Layer z={-130}>
              <D s={{ left: -356, top: -336, width: 712, height: 196, overflow: 'hidden' }}>
                <div style={{ width: 712, height: 392, boxSizing: 'border-box', border: '16px solid #2a302a', borderRadius: '50%' }} />
              </D>
              <D s={{ left: -380, top: -366, width: 760, height: 226, overflow: 'hidden' }}>
                <div style={{ width: 760, height: 452, boxSizing: 'border-box', border: '22px solid #e9efe7', borderRadius: '50%' }} />
              </D>
            </Layer>
            <Layer z={0}>
              <D c="pd-shell" s={{ left: -320, top: -242, width: 640, height: 484, boxSizing: 'border-box', border: `18px solid ${MAIN}`, borderRadius: 137, background: '#10150f' }} />
            </Layer>
            <Layer z={26}>
              <D s={{ left: -292, top: -214, width: 584, height: 428, borderRadius: 110, background: '#141a12' }} />
            </Layer>
            <Layer z={-20}><Cup m={-1} /><Cup m={1} /></Layer>

            <Layer z={96}>
              <div className="pd-eo">{eyeBox('pd-eL', -193)}{eyeBox('pd-eR', 21)}</div>
              <div className="pd-ew">{eyeBox('pd-eW', -199, 185, 224, -108, 62)}{eyeBox('pd-eW', 14, 185, 224, -108, 62)}</div>
              <div className="pd-eh">{arc(-182)}{arc(31)}</div>
              <div className="pd-ec">{line(-158)}{line(55)}</div>
            </Layer>
            <Layer z={118}>
              <div className="pd-po">{pupil('pd-pL', -153)}{pupil('pd-pR', 61)}</div>
            </Layer>
            <Layer z={132}>
              <div className="pd-brw">{brow('pd-bL', -186, -14)}{brow('pd-bR', 26, 14)}</div>
              {brow('pd-bR', 26, 0, true)}
            </Layer>
          </div>

          <div className="pd-fx">
            <span className="pd-note" style={{ left: 740, top: 150 }}>♪</span>
            <span className="pd-note" style={{ left: 40, top: 130 }}>♫</span>
            <span className="pd-note" style={{ left: 790, top: 260 }}>♪</span>
            <div className="pd-rec"><i />REC</div>
            <div className="pd-mic" />
            <div className="pd-cut"><b /><b /></div>
            <div className="pd-dots"><i /><i /><i /></div>
            <div className="pd-mag"><i /><b /></div>
            <span className="pd-z">z</span><span className="pd-z">Z</span>
            <div className="pd-sweat" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} className="pd-conf" />)}
            <span className="pd-q">?</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Uygulamanın durumundan ruh hali ────────────────────────────────────────────

export function usePadoMood() {
  const playingCount = useSoundStore((s) => Object.values(s.playingSounds).reduce((n, i) => n + i.length, 0));
  const studioOpen = useCollageStore((s) => s.isOpen);
  const studioPlaying = useCollageStore((s) => s.playing);
  const recording = useCollageStore((s) => s.recording);
  const selectedClip = useCollageStore((s) => s.selectedClipId);
  const busy = usePadoStore((s) => s.busy);
  const onlineLoading = useOnlineStore((s) => s.loading);
  const onlineDownloading = useOnlineStore((s) => Object.keys(s.downloading).length > 0);
  const celebrateUntil = usePadoStore((s) => s.celebrateUntil);
  const alarmUntil = usePadoStore((s) => s.alarmUntil);
  const lastActive = usePadoStore((s) => s.lastActive);
  const [now, setNow] = useState(Date.now());

  // süreli durumların (kutlama, dikkat, uyku) bitişini yakalamak için saniyede bir kontrol
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (alarmUntil > now) return 'alarm';
  if (celebrateUntil > now) return 'celebrate';
  if (recording) return 'recording';
  if (busy || onlineDownloading) return 'working';
  if (onlineLoading) return 'searching';
  if (playingCount > 0 || (studioOpen && studioPlaying)) return 'playing';
  if (studioOpen && selectedClip) return 'editing';
  if (now - lastActive > 5 * 60 * 1000) return 'sleeping';
  return 'idle';
}

// Dokununca rastgele bir hareket yapar; tooltip ruh halini söyler.
export function PadoMascot({ size = 48, className = '' }) {
  const mood = usePadoMood();
  const gesture = usePadoStore((s) => s.gesture);
  const poke = usePadoStore((s) => s.poke);
  return (
    <Pado
      key={gesture ? gesture.key : 'rest'}
      mood={mood}
      size={size}
      gesture={gesture?.name || null}
      className={className}
      onClick={() => poke()}
      title={`Pado ${LABEL[mood]} — dokun`}
    />
  );
}
