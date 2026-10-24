import { memo, useCallback, useEffect, useRef, useState } from 'react';
import useCollageStore, { MIN_CLIP } from '../store/useCollageStore';
import useSoundStore from '../store/useSoundStore';
import {
  CollagePlayer, loadBuffer, drawClipWave, getPeaks, projectEnd, renderProject,
  prepareRecording, countIn, toUrl,
} from '../audio/collageEngine';
import { extractAudioToMp3, encodeAudioBufferToMp3 } from '../audio/extractAudio';
import Pado, { PadoMascot } from './Pado';
import usePadoStore from '../store/usePadoStore';
import useOnlineStore, { SUGGESTIONS, creditOf } from '../store/useOnlineStore';
import { fmtDur, useElapsed, loadingLine } from './OnlineBoard';

const HEADER_W = 224;
const ROW_H = 104;
const RULER_H = 28;
const VIDEO_RE = /\.(mp4|webm|mkv|mov|avi|m4v)$/i;
const SOUND_MIME = 'application/x-sb-sound';
const ONLINE_MIME = 'application/x-sb-online';

const C = {
  bg: '#0a0c0a', panel: '#0e110e', card: '#121612', border: '#1d231d', line: '#2a302a',
  text: '#e9efe7', muted: '#a3ae9f', dim: '#7d887a', accent: '#c4ff00', red: '#ff5a4d',
};

function fmtTime(t) {
  const v = Math.max(0, t || 0);
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

// ─── Taşıma (UI'dan bağımsız, modül düzeyi) ────────────────────────────────────

const player = new CollagePlayer();
let recSession = null;

const S = () => useCollageStore.getState();

function playFrom(t) {
  const st = S();
  st.setPosition(t);
  st.setPlaying(true);
  player.play(st.project, t, {
    onTick: (p) => S().setPosition(p),
    onEnd: () => S().setPlaying(false),
  });
}

function stopPlayback() {
  const pos = player.stop();
  S().setPlaying(false);
  S().setPosition(pos);
}

function togglePlay() {
  const st = S();
  if (st.recording) return;
  if (st.playing) { stopPlayback(); return; }
  // Sondaysa baştan çal
  playFrom(st.position >= projectEnd(st.project) - 0.01 ? 0 : st.position);
}

function seek(t) {
  const st = S();
  if (st.recording) return;
  st.setPosition(t);
  if (st.playing) playFrom(t);
}

async function saveBytes(arrayBuffer, ext) {
  if (window.electronAPI) {
    const saved = await window.electronAPI.saveRecording(arrayBuffer, ext);
    if (!saved.success) throw new Error(saved.error || 'Kaydedilemedi');
    return saved.destPath;
  }
  return URL.createObjectURL(new Blob([arrayBuffer]));
}

async function startRecordFlow() {
  const st = S();
  let track = st.project.tracks.find((t) => t.armed);
  if (!track) {
    const id = st.addTrack('Vokal');
    S().armTrack(id);
    track = S().project.tracks.find((t) => t.id === id);
  }
  stopPlayback();
  const from = S().position;

  let rec;
  try {
    S().setStatus('Mikrofon açılıyor...');
    rec = await prepareRecording({ monitor: st.monitor, onLevel: (l) => S().setRecLevel(l) });
  } catch (err) {
    S().setStatus(`Mikrofona erişilemedi: ${err.message}`);
    usePadoStore.getState().alarm();
    return;
  }
  if (st.countInOn) {
    S().setStatus('Geri sayım...');
    await countIn(3, 600);
  }
  S().setStatus('');
  recSession = { rec, trackId: track.id, from };
  S().setRecording(true, { from, trackId: track.id });
  S().setPlaying(true);
  rec.begin();
  player.play(S().project, from, { endless: true, onTick: (p) => S().setPosition(p) });
}

async function finishRecordFlow() {
  const s = recSession;
  recSession = null;
  if (!s) return;
  const st = S();
  player.stop();
  st.setPlaying(false);
  st.setRecording(false);
  st.setRecLevel(0);
  try {
    const { arrayBuffer, ext } = await s.rec.stop();
    S().setStatus('Kayıt işleniyor...');
    const src = await saveBytes(arrayBuffer, ext);
    const buffer = await loadBuffer(src);
    const offset = Math.min(S().latencyMs / 1000, Math.max(0, buffer.duration - 0.1));
    const takes = S().project.clips.filter((c) => c.trackId === s.trackId && c.name.startsWith('Take')).length;
    S().addClip({
      trackId: s.trackId, name: `Take ${takes + 1}`, src, srcDur: buffer.duration,
      start: s.from, offset, dur: buffer.duration - offset,
    });
    S().setStatus('');
  } catch (err) {
    S().setStatus(`Kayıt kaydedilemedi: ${err.message}`);
  }
}

function toggleRecord() {
  if (S().recording) finishRecordFlow();
  else startRecordFlow();
}

// ─── Klip ekleme (sürükle-bırak, kütüphane, dosya) ─────────────────────────────

async function addSoundClip(soundId, trackId, t) {
  const sound = useSoundStore.getState().sounds.find((x) => x.id === soundId);
  if (!sound) return t;
  try {
    const buffer = await loadBuffer(sound.filePath);
    const offset = Math.min(sound.trimStart || 0, buffer.duration - MIN_CLIP);
    const end = Math.min(sound.trimEnd ?? buffer.duration, buffer.duration);
    const dur = Math.max(MIN_CLIP, end - offset);
    S().addClip({ trackId, name: sound.name, src: sound.filePath, srcDur: buffer.duration, start: t, offset, dur });
    return t + dur;
  } catch (err) {
    S().setStatus(`Eklenemedi: ${sound.name} (${err.message})`);
    return t;
  }
}

async function addFileClip({ name, path, file }, trackId, t) {
  const base = name.replace(/\.[^.]+$/, '');
  try {
    let src;
    if (window.electronAPI && path) {
      if (VIDEO_RE.test(name)) {
        S().setStatus('Videodan ses çıkarılıyor...');
        const mp3 = await extractAudioToMp3(toUrl(path), (p) => S().setStatus(`MP3'e çevriliyor... %${Math.round(p * 100)}`));
        src = await saveBytes(mp3, 'mp3');
      } else {
        const r = await window.electronAPI.copyFile(path); // orijinale dokunmaz
        src = r.success ? r.destPath : path;
      }
    } else if (file) {
      src = URL.createObjectURL(file);
    } else {
      return t;
    }
    const buffer = await loadBuffer(src);
    S().addClip({ trackId, name: base, src, srcDur: buffer.duration, start: t, offset: 0, dur: buffer.duration });
    S().setStatus('');
    return t + buffer.duration;
  } catch (err) {
    S().setStatus(`Eklenemedi: ${name} (${err.message})`);
    return t;
  }
}

// Çevrimiçi ses: önizleme indirme değildi, indirme ancak buraya (zaman çizelgesine) alınınca olur
async function addOnlineClip(item, trackId, t) {
  S().setStatus(`İndiriliyor: ${item.title}...`);
  const src = await useOnlineStore.getState().fetchFile(item);
  if (!src) {
    S().setStatus(`İndirilemedi: ${item.title}${useOnlineStore.getState().error ? ` (${useOnlineStore.getState().error})` : ''}`);
    return t;
  }
  try {
    const buffer = await loadBuffer(src);
    S().addClip({
      trackId, name: item.title, src, srcDur: buffer.duration, start: t, offset: 0, dur: buffer.duration, credit: creditOf(item),
    });
    S().setStatus('');
    return t + buffer.duration;
  } catch (err) {
    S().setStatus(`Eklenemedi: ${item.title} (${err.message})`);
    return t;
  }
}

async function handleDrop(dt, trackId, t) {
  const onlineRaw = dt.getData(ONLINE_MIME);
  if (onlineRaw) {
    try { await addOnlineClip(JSON.parse(onlineRaw), trackId, t); } catch (_) { S().setStatus('Çevrimiçi ses okunamadı.'); }
    return;
  }
  const soundId = dt.getData(SOUND_MIME);
  const files = Array.from(dt.files || []);
  if (soundId) { await addSoundClip(soundId, trackId, t); return; }
  let cursor = t;
  for (const f of files) {
    // eslint-disable-next-line no-await-in-loop
    cursor = await addFileClip({ name: f.name, path: f.path, file: f }, trackId, cursor);
  }
}

const hasPayload = (e) => {
  const types = Array.from(e.dataTransfer?.types || []);
  return types.includes('Files') || types.includes(SOUND_MIME) || types.includes(ONLINE_MIME);
};

// ─── Küçük parçalar ────────────────────────────────────────────────────────────

function Btn({ children, onClick, active, danger, title, className = '', disabled }) {
  return (
    <button
      type="button" onClick={onClick} title={title} disabled={disabled}
      className={`h-8 px-3 text-xs font-bold font-mono tracking-wide transition-colors disabled:opacity-40 ${className}`}
      style={{
        background: active ? 'rgba(196,255,0,0.14)' : '#1a1f1a',
        color: danger ? '#ff8f84' : active ? C.accent : C.text,
        border: 0,
      }}
    >
      {children}
    </button>
  );
}

function Playhead({ px }) {
  const position = useCollageStore((s) => s.position);
  const recording = useCollageStore((s) => s.recording);
  return (
    <div
      className="absolute top-0 bottom-0 w-[2px] pointer-events-none z-[15]"
      style={{ left: HEADER_W + position * px, background: recording ? C.red : '#fff' }}
    />
  );
}

function RecBlock({ track, px }) {
  const position = useCollageStore((s) => s.position);
  const recording = useCollageStore((s) => s.recording);
  const recFrom = useCollageStore((s) => s.recFrom);
  const recTrackId = useCollageStore((s) => s.recTrackId);
  if (!recording || recTrackId !== track.id) return null;
  const w = Math.max(2, (position - recFrom) * px);
  return (
    <div
      className="absolute pointer-events-none flex items-start p-2 text-[11px] font-bold font-mono"
      style={{ left: recFrom * px, top: 6, height: ROW_H - 12, width: w, background: 'rgba(255,90,77,0.55)', outline: `2px solid ${C.red}`, color: '#fff' }}
    >
      ● KAYITTA
    </div>
  );
}

const ClipView = memo(function ClipView({ clip, color, px, selected, onPointerDown }) {
  const canvasRef = useRef(null);
  const [buf, setBuf] = useState(null);

  useEffect(() => {
    let live = true;
    loadBuffer(clip.src).then((b) => { if (live) setBuf(b); }).catch(() => {});
    return () => { live = false; };
  }, [clip.src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buf) return;
    canvas.width = Math.min(8192, Math.max(1, Math.round(clip.dur * px)));
    canvas.height = ROW_H - 12 - 22;
    drawClipWave(canvas, buf, { offset: clip.offset, dur: clip.dur, gain: clip.gain, color: 'rgba(0,0,0,0.55)' });
  }, [buf, clip.offset, clip.dur, clip.gain, px]);

  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute overflow-hidden"
      style={{
        left: clip.start * px, top: 6, width: Math.max(4, clip.dur * px), height: ROW_H - 12,
        background: color, outline: selected ? '2px solid #fff' : 'none', outlineOffset: -2,
        cursor: 'grab', touchAction: 'none',
      }}
    >
      <span className="absolute left-2 top-1 text-[11px] font-bold whitespace-nowrap z-10" style={{ color: '#0b0d0b' }}>{clip.name}</span>
      <canvas ref={canvasRef} className="absolute left-0 bottom-1 w-full" style={{ height: ROW_H - 12 - 22 }} />
      {clip.fadeIn > 0 && (
        <div className="absolute left-0 top-0 bottom-0 pointer-events-none" style={{ width: clip.fadeIn * px, background: 'linear-gradient(90deg,rgba(0,0,0,0.5),transparent)' }} />
      )}
      {clip.fadeOut > 0 && (
        <div className="absolute right-0 top-0 bottom-0 pointer-events-none" style={{ width: clip.fadeOut * px, background: 'linear-gradient(270deg,rgba(0,0,0,0.5),transparent)' }} />
      )}
      <div className="absolute left-0 top-0 bottom-0 w-[6px] cursor-ew-resize" />
      <div className="absolute right-0 top-0 bottom-0 w-[6px] cursor-ew-resize" />
    </div>
  );
});

function TrackHeader({ track, canRemove }) {
  const upd = (patch) => S().updateTrack(track.id, patch);
  return (
    <div
      className="sticky left-0 z-20 shrink-0 flex flex-col gap-1.5 box-border"
      style={{ width: HEADER_W, height: ROW_H, padding: '8px 12px 8px 0', background: C.bg, borderBottom: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 shrink-0" style={{ background: track.color }} />
        <input
          value={track.name} onChange={(e) => upd({ name: e.target.value })}
          aria-label="Kanal adı"
          className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold outline-none text-white"
        />
        {[['R', 'armed', 'Kayda hazırla', () => S().armTrack(track.id), C.red],
          ['M', 'mute', 'Sessiz', () => upd({ mute: !track.mute }), C.accent],
          ['S', 'solo', 'Solo', () => upd({ solo: !track.solo }), C.accent]].map(([l, k, title, fn, col]) => (
            <button
              key={k} type="button" title={title} aria-pressed={!!track[k]} onClick={fn}
              className="w-6 h-6 text-[11px] font-bold"
              style={{ background: track[k] ? col : '#1a1f1a', color: track[k] ? '#0b0d0b' : C.muted, border: 0 }}
            >{l}</button>
        ))}
        {canRemove && (
          <button type="button" title="Kanalı sil" onClick={() => S().removeTrack(track.id)} className="w-5 h-6 text-[11px]" style={{ color: C.dim, background: 'transparent', border: 0 }}>✕</button>
        )}
      </div>
      <label className="flex items-center gap-2 text-[10px] font-mono" style={{ color: C.dim }}>
        <span className="w-7">SES</span>
        <input type="range" min="0" max="1.5" step="0.01" value={track.vol} onChange={(e) => upd({ vol: Number(e.target.value) })} className="flex-1 min-w-0" style={{ accentColor: C.accent }} />
      </label>
      <label className="flex items-center gap-2 text-[10px] font-mono" style={{ color: C.dim }}>
        <span className="w-7">PAN</span>
        <input type="range" min="-1" max="1" step="0.01" value={track.pan} onChange={(e) => upd({ pan: Number(e.target.value) })} className="flex-1 min-w-0" style={{ accentColor: C.accent }} />
      </label>
    </div>
  );
}

function Ruler({ px, width }) {
  const step = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * px >= 70) || 120;
  const ticks = [];
  for (let t = 0; t * px <= width; t += step) ticks.push(t);

  const onDown = (e) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const at = (ev) => seek(Math.max(0, (ev.clientX - el.getBoundingClientRect().left) / px));
    at(e);
    const move = (ev) => at(ev);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div onPointerDown={onDown} className="relative cursor-pointer select-none" style={{ width, height: RULER_H, borderBottom: `1px solid ${C.line}`, background: C.bg }}>
      {ticks.map((t) => (
        <div key={t} className="absolute bottom-0" style={{ left: t * px, height: 14, borderLeft: `1px solid ${C.line}` }}>
          <span className="absolute left-1 -top-3.5 text-[10px] font-mono whitespace-nowrap" style={{ color: C.dim }}>
            {step < 1 ? `${t.toFixed(2)}s` : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function Timeline() {
  const project = useCollageStore((s) => s.project);
  const px = useCollageStore((s) => s.pxPerSec);
  const selectedId = useCollageStore((s) => s.selectedClipId);
  const rowRefs = useRef({});
  const [hint, setHint] = useState(null); // { trackId|'new', t }

  const laneW = Math.ceil(Math.max(40, projectEnd(project) + 20) * px);

  const timeAt = (e, el) => S().snapTime(Math.max(0, (e.clientX - el.getBoundingClientRect().left) / S().pxPerSec));

  const onLaneDown = (e, trackId) => {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    S().select(null);
    seek(Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / px));
    void trackId;
  };

  const startClipDrag = (e, clip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const mode = x < 8 ? 'left' : x > rect.width - 8 ? 'right' : 'move';
    S().select(clip.id);
    S().beginGesture();
    const startX = e.clientX;
    const orig = { ...clip };
    const srcDur = orig.srcDur ?? Infinity;

    const onMove = (ev) => {
      const s = S();
      const dt = (ev.clientX - startX) / s.pxPerSec;
      if (mode === 'move') {
        let trackId = orig.trackId;
        for (const t of s.project.tracks) {
          const el = rowRefs.current[t.id];
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (ev.clientY >= r.top && ev.clientY < r.bottom) { trackId = t.id; break; }
        }
        s.patchClip(orig.id, { start: s.snapTime(orig.start + dt), trackId }, { history: false });
      } else if (mode === 'left') {
        let delta = s.snapTime(orig.start + dt) - orig.start;
        delta = Math.max(delta, -orig.offset, -orig.start);
        delta = Math.min(delta, orig.dur - MIN_CLIP);
        s.patchClip(orig.id, { start: orig.start + delta, offset: orig.offset + delta, dur: orig.dur - delta }, { history: false });
      } else {
        let dur = s.snapTime(orig.start + orig.dur + dt) - orig.start;
        dur = Math.max(MIN_CLIP, Math.min(dur, srcDur - orig.offset));
        s.patchClip(orig.id, { dur }, { history: false });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const dragOver = (e, key) => {
    if (!hasPayload(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setHint({ key, t: timeAt(e, e.currentTarget) });
  };

  const drop = async (e, trackId) => {
    e.preventDefault();
    e.stopPropagation();
    const t = timeAt(e, e.currentTarget);
    setHint(null);
    let id = trackId;
    if (id === 'new') {
      const first = Array.from(e.dataTransfer.files || [])[0];
      id = S().addTrack(first ? first.name.replace(/\.[^.]+$/, '').slice(0, 18) : undefined);
    }
    await handleDrop(e.dataTransfer, id, t);
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto relative" style={{ background: C.bg }}>
      <div className="relative" style={{ width: HEADER_W + laneW, minWidth: '100%' }}>
        <div className="sticky top-0 z-30 flex" style={{ height: RULER_H, background: C.bg }}>
          <div className="sticky left-0 z-40 shrink-0" style={{ width: HEADER_W, background: C.bg, borderBottom: `1px solid ${C.line}` }} />
          <Ruler px={px} width={laneW} />
        </div>

        {project.tracks.map((track) => (
          <div key={track.id} className="flex">
            <TrackHeader track={track} canRemove={project.tracks.length > 1} />
            <div
              ref={(el) => { rowRefs.current[track.id] = el; }}
              className="relative shrink-0"
              style={{
                width: laneW, height: ROW_H, background: track.armed ? 'rgba(255,90,77,0.05)' : C.panel,
                borderBottom: `1px solid ${C.border}`,
                outline: hint?.key === track.id ? `2px solid ${C.accent}` : 'none', outlineOffset: -2,
              }}
              onPointerDown={(e) => onLaneDown(e, track.id)}
              onDragOver={(e) => dragOver(e, track.id)}
              onDragLeave={() => setHint(null)}
              onDrop={(e) => drop(e, track.id)}
            >
              {project.clips.filter((c) => c.trackId === track.id).map((clip) => (
                <ClipView
                  key={clip.id} clip={clip} color={track.color} px={px}
                  selected={selectedId === clip.id}
                  onPointerDown={(e) => startClipDrag(e, clip)}
                />
              ))}
              <RecBlock track={track} px={px} />
              {hint?.key === track.id && (
                <div className="absolute top-0 bottom-0 w-[2px] pointer-events-none" style={{ left: hint.t * px, background: C.accent }}>
                  <span className="absolute left-1 top-1 text-[10px] font-bold font-mono px-1.5" style={{ background: C.accent, color: '#0b0d0b' }}>{hint.t.toFixed(2)} s</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Yeni kanal bırakma alanı */}
        <div className="flex" style={{ height: 52 }}>
          <div className="sticky left-0 z-20 shrink-0" style={{ width: HEADER_W, background: C.bg }} />
          <div
            className="flex items-center gap-3 px-4 text-[13px] my-2 mx-0"
            style={{
              width: Math.min(laneW, 720), color: C.muted,
              border: `1px dashed ${hint?.key === 'new' ? C.accent : '#3a4a3a'}`,
              background: hint?.key === 'new' ? 'rgba(196,255,0,0.07)' : 'transparent',
            }}
            onDragOver={(e) => dragOver(e, 'new')}
            onDragLeave={() => setHint(null)}
            onDrop={(e) => drop(e, 'new')}
          >
            <button type="button" onClick={() => S().addTrack()} className="font-bold" style={{ color: C.accent, background: 'transparent', border: 0 }}>+ Kanal</button>
            <span>veya yeni kanal için ses / video dosyası bırak</span>
          </div>
        </div>

        <Playhead px={px} />
      </div>
    </div>
  );
}

function OnlineRow({ item, onAdd }) {
  const playing = useOnlineStore((s) => s.playingId === item.id);
  const busy = useOnlineStore((s) => !!s.downloading[item.id]);
  const toggle = useOnlineStore((s) => s.togglePreview);
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(ONLINE_MIME, JSON.stringify(item)); e.dataTransfer.effectAllowed = 'copy'; }}
      title="Zaman çizelgesine sürükle: o zaman iner"
      className="flex items-center gap-2 px-2 py-1.5 cursor-grab"
      style={{ background: playing ? 'rgba(196,255,0,0.1)' : C.card }}
    >
      <button
        type="button" onClick={() => toggle(item)} aria-label={playing ? 'Durdur' : `${item.title} dinle`}
        className="w-7 h-7 shrink-0 text-[11px]" style={{ background: playing ? C.accent : '#1a1f1a', color: playing ? '#0b0d0b' : C.text, border: 0 }}
      >
        {playing ? '■' : '▶'}
      </button>
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="text-[12px] font-semibold truncate">{item.title}</span>
        <span className="text-[10px] truncate" style={{ color: C.dim }}>{item.creator || 'Bilinmeyen'} · {fmtDur(item.durationMs)}</span>
      </div>
      <button
        type="button" onClick={() => onAdd(item)} disabled={busy} aria-label={`${item.title} ekle`}
        className="w-6 h-6 text-sm disabled:opacity-50" style={{ border: `1px solid ${C.line}`, color: C.text, background: 'transparent' }}
      >
        {busy ? '…' : '+'}
      </button>
    </div>
  );
}

function OnlineTab({ onAdd }) {
  const { query, results, loading, loadingKind, error, quota, searched, hasMore, search, loadMore } = useOnlineStore();
  const [text, setText] = useState(query);
  const sec = useElapsed(loading);

  useEffect(() => {
    if (!searched && window.electronAPI) search('sound effect');
  }, []);

  const submit = (e) => { e.preventDefault(); search(text); };

  return (
    <>
      <form onSubmit={submit} className="flex gap-1.5">
        <input
          value={text} onChange={(e) => setText(e.target.value)} placeholder="Çevrimiçi ses ara..." aria-label="Çevrimiçi ses ara"
          className="flex-1 min-w-0 h-9 px-3 text-sm outline-none text-white font-mono" style={{ background: C.card, border: `1px solid ${C.border}` }}
        />
        <button type="submit" disabled={loading || !text.trim()} className="h-9 px-3 text-xs font-bold disabled:opacity-50" style={{ background: C.accent, color: '#0b0d0b', border: 0 }}>ARA</button>
      </form>
      <div className="flex flex-wrap gap-1">
        {SUGGESTIONS.slice(0, 6).map((w) => (
          <button key={w} type="button" onClick={() => { setText(w); search(w); }} className="px-2 py-0.5 text-[10px]" style={{ background: '#1a1f1a', color: C.muted, border: 0 }}>{w}</button>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center gap-2" role="status">
          <Pado mood="searching" size={64} />
          <span className="text-[11px] leading-snug" style={{ color: C.accent }}>{loadingLine(loadingKind, sec, query)}</span>
        </div>
      ) : (
        <div className="text-[10px] font-mono" style={{ color: C.dim }}>
          {searched && !error ? `${results.length} sonuç gösteriliyor` : ''}
          {quota ? ` · kalan: günde ${quota.day ?? '?'}` : ''}
        </div>
      )}
      {error && <p className="text-[11px] p-2" style={{ background: 'rgba(255,90,77,0.1)', color: '#ffb3aa' }}>{error}</p>}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
        {results.map((item) => <OnlineRow key={item.id} item={item} onAdd={onAdd} />)}
        {hasMore && (
          <button type="button" onClick={loadMore} disabled={loading} className="h-8 text-[11px] font-bold disabled:opacity-50" style={{ background: '#1a1f1a', color: C.muted, border: 0 }}>
            {loading ? 'YÜKLENİYOR...' : 'DAHA FAZLA'}
          </button>
        )}
      </div>
      <div className="text-[11px] leading-relaxed p-2.5" style={{ border: `1px dashed ${C.line}`, color: C.muted }}>
        ▶ sadece dinletir, <strong style={{ color: C.text }}>hiçbir şey indirmez</strong>. Zaman çizelgesine sürükleyince (ya da +) ses o zaman iner. Openverse, CC0.
      </div>
    </>
  );
}

function Library() {
  const sounds = useSoundStore((s) => s.sounds);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('mine');

  // sekme değişince ya da panel kapanınca çalan önizleme dursun
  useEffect(() => { if (tab !== 'online') useOnlineStore.getState().stop(); }, [tab]);
  useEffect(() => () => useOnlineStore.getState().stop(), []);
  const list = sounds.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  const addFromDialog = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.openFileDialog();
    if (res.canceled || !res.filePaths?.length) return;
    const st = S();
    const trackId = st.project.tracks.find((t) => t.armed)?.id || st.project.tracks[0].id;
    let t = st.position;
    for (const p of res.filePaths) {
      // eslint-disable-next-line no-await-in-loop
      t = await addFileClip({ name: p.split(/[\\/]/).pop(), path: p }, trackId, t);
    }
  };

  const addOnlineAtPlayhead = (item) => {
    const st = S();
    const sel = st.project.clips.find((c) => c.id === st.selectedClipId);
    const trackId = sel?.trackId || st.project.tracks.find((t) => t.armed)?.id || st.project.tracks[0].id;
    addOnlineClip(item, trackId, st.snapTime(st.position));
  };

  const addAtPlayhead = (sound) => {
    const st = S();
    const sel = st.project.clips.find((c) => c.id === st.selectedClipId);
    const trackId = sel?.trackId || st.project.tracks.find((t) => t.armed)?.id || st.project.tracks[0].id;
    addSoundClip(sound.id, trackId, st.snapTime(st.position));
  };

  return (
    <aside className="shrink-0 flex flex-col gap-3 p-3 box-border" style={{ width: 280, background: C.panel, borderRight: `1px solid ${C.border}` }}>
      <div role="tablist" aria-label="Kaynak" className="flex" style={{ background: C.card, padding: 3, gap: 2 }}>
        {[['mine', 'Seslerim'], ['online', 'Çevrimiçi']].map(([id, label]) => (
          <button
            key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className="flex-1 h-8 text-xs font-bold"
            style={{ background: tab === id ? '#232923' : 'transparent', color: tab === id ? C.text : C.muted, border: 0 }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'online' ? <OnlineTab onAdd={addOnlineAtPlayhead} /> : (
      <>
      <div className="flex items-center justify-end">
        <button type="button" onClick={addFromDialog} className="text-[11px] font-bold font-mono" style={{ color: C.accent, background: 'transparent', border: 0 }}>+ DOSYA</button>
      </div>
      <input
        value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ses ara..." aria-label="Ses ara"
        className="h-9 px-3 text-sm outline-none text-white font-mono"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
      />
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
        {list.length === 0 && <p className="text-xs font-mono" style={{ color: C.dim }}>Ses bulunamadı.</p>}
        {list.map((s) => (
          <div
            key={s.id} draggable
            onDragStart={(e) => { e.dataTransfer.setData(SOUND_MIME, s.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onDoubleClick={() => addAtPlayhead(s)}
            title="Zaman çizelgesine sürükle ya da çift tıkla"
            className="flex items-center gap-2.5 px-2.5 py-2 cursor-grab"
            style={{ background: C.card }}
          >
            <span className="w-2.5 h-7 shrink-0" style={{ background: s.color }} />
            <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">{s.name}</span>
            <button type="button" aria-label={`${s.name} ekle`} onClick={() => addAtPlayhead(s)} className="w-6 h-6 text-sm" style={{ border: `1px solid ${C.line}`, color: C.text, background: 'transparent' }}>+</button>
          </div>
        ))}
      </div>
      <div className="text-[11px] leading-relaxed p-2.5" style={{ border: `1px dashed ${C.line}`, color: C.muted }}>
        Ses ya da video dosyasını doğrudan zaman çizelgesine sürükleyebilirsin. "Çevrimiçi" sekmesinde ücretsiz sesler var.
      </div>
      </>
      )}
    </aside>
  );
}

function SliderRow({ label, value, min, max, step, onChange, text, ...rest }) {
  return (
    <label className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
      <span className="w-20 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onPointerDown={() => S().beginGesture()}
        onKeyDown={() => S().beginGesture()}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 min-w-0" style={{ accentColor: C.accent }} {...rest}
      />
      <span className="w-12 text-right font-mono" style={{ color: C.text }}>{text}</span>
    </label>
  );
}

function NumberField({ label, value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft == null) return;
    const n = Number.parseFloat(draft.replace(',', '.'));
    setDraft(null);
    if (Number.isFinite(n)) onCommit(n);
  };
  return (
    <label className="flex flex-col gap-1 flex-1 text-[11px]" style={{ color: C.muted }}>
      {label}
      <input
        value={draft ?? value.toFixed(3)} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="h-8 px-2 text-[13px] font-mono outline-none text-white"
        style={{ background: C.bg, border: `1px solid ${C.border}` }}
      />
    </label>
  );
}

function Inspector({ onMerge }) {
  const project = useCollageStore((s) => s.project);
  const selectedId = useCollageStore((s) => s.selectedClipId);
  const clip = project.clips.find((c) => c.id === selectedId);
  const track = clip && project.tracks.find((t) => t.id === clip.trackId);
  const latencyMs = useCollageStore((s) => s.latencyMs);
  const monitor = useCollageStore((s) => s.monitor);
  const countInOn = useCollageStore((s) => s.countInOn);
  const recLevel = useCollageStore((s) => s.recLevel);
  const [peak, setPeak] = useState(1);

  useEffect(() => {
    if (!clip) return undefined;
    let live = true;
    loadBuffer(clip.src).then((b) => {
      if (!live) return;
      const { mins, maxs } = getPeaks(b);
      let p = 0.0001;
      for (let i = 0; i < maxs.length; i++) p = Math.max(p, Math.abs(maxs[i]), Math.abs(mins[i]));
      setPeak(p);
    }).catch(() => {});
    return () => { live = false; };
  }, [clip?.src]);

  const patch = (p, history = false) => clip && S().patchClip(clip.id, p, { history });
  const peakDb = 20 * Math.log10(peak * (clip?.gain ?? 1));

  return (
    <aside className="shrink-0 flex flex-col gap-3 p-3 box-border overflow-y-auto" style={{ width: 320, background: C.panel, borderLeft: `1px solid ${C.border}` }}>
      <section className="p-3.5 flex flex-col gap-2.5" style={{ background: C.card }}>
        <h2 className="text-[15px] font-bold">Kayıt</h2>
        <div className="h-2" style={{ background: C.bg, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.min(100, recLevel * 100)}%`, background: 'linear-gradient(90deg,#3fb868,#c4ff00 70%,#ffb347)' }} />
        </div>
        <label className="flex items-center justify-between text-xs" style={{ color: C.muted }}>
          Geri sayım (3 bip)
          <input type="checkbox" checked={countInOn} onChange={(e) => S().setCountIn(e.target.checked)} style={{ accentColor: C.accent }} />
        </label>
        <label className="flex items-center justify-between text-xs" style={{ color: C.muted }}>
          Kendini duy (kulaklık tak!)
          <input type="checkbox" checked={monitor} onChange={(e) => S().setMonitor(e.target.checked)} style={{ accentColor: C.accent }} />
        </label>
        <SliderRow label="Gecikme" value={latencyMs} min={0} max={300} step={1} onChange={(v) => S().setLatency(v)} text={`${latencyMs} ms`} onPointerDown={undefined} onKeyDown={undefined} />
        <p className="text-[11px] leading-snug" style={{ color: C.dim }}>Kayıt arkadaki sesten geç kalıyorsa gecikmeyi artır; kayıt baştan o kadar kırpılır.</p>
      </section>

      <section className="p-3.5 flex flex-col gap-2.5" style={{ background: C.card }}>
        {!clip ? (
          <p className="text-xs" style={{ color: C.muted }}>Bir klip seç. Taşımak için sürükle, kenarlarından kırp.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold truncate">{clip.name}</h2>
              <span className="text-[11px]" style={{ color: C.muted }}>{track?.name}</span>
            </div>
            <div className="flex gap-2">
              <NumberField label="Başlangıç" value={clip.start} onCommit={(v) => patch({ start: Math.max(0, v) }, true)} />
              <NumberField label="Süre" value={clip.dur} onCommit={(v) => patch({ dur: Math.max(MIN_CLIP, Math.min(v, (clip.srcDur ?? Infinity) - clip.offset)) }, true)} />
            </div>
            <SliderRow label="Güçlendirme" value={clip.gain} min={0} max={5} step={0.05} onChange={(v) => patch({ gain: v })} text={`%${Math.round(clip.gain * 100)}`} />
            {peakDb > 0 && (
              <p className="text-[11px] p-2" style={{ background: 'rgba(255,90,77,0.1)', color: '#ffb3aa' }}>
                Tepe +{peakDb.toFixed(1)} dB. Limiter devreye girer, ses bozulabilir.
              </p>
            )}
            <SliderRow label="Fade giriş" value={clip.fadeIn} min={0} max={Math.min(5, clip.dur / 2)} step={0.05} onChange={(v) => patch({ fadeIn: v })} text={clip.fadeIn.toFixed(2)} />
            <SliderRow label="Fade çıkış" value={clip.fadeOut} min={0} max={Math.min(5, clip.dur / 2)} step={0.05} onChange={(v) => patch({ fadeOut: v })} text={clip.fadeOut.toFixed(2)} />
            <div className="flex flex-wrap gap-1.5">
              <Btn onClick={() => S().splitClip(clip.id, S().position)} title="S">Böl</Btn>
              <Btn onClick={() => S().duplicateClip(clip.id)} title="Ctrl+D">Çoğalt</Btn>
              <Btn onClick={() => patch({ gain: Math.min(5, 0.891 / peak) }, true)}>Normalize</Btn>
              <Btn danger onClick={() => S().deleteClip(clip.id)} title="Delete">Sil</Btn>
            </div>
          </>
        )}
      </section>

      <section className="p-3.5 flex flex-col gap-2.5" style={{ background: C.card }}>
        <h2 className="text-[15px] font-bold">Birleştirme</h2>
        <p className="text-xs" style={{ color: C.muted }}>Tüm kanalları tek bir MP3 olarak birleştirip yeni ses butonu ekler.</p>
        <button type="button" onClick={onMerge} className="h-10 text-sm font-bold" style={{ background: C.accent, color: '#0b0d0b', border: 0 }}>
          Tek ses olarak birleştir
        </button>
      </section>
    </aside>
  );
}

function MergeDialog({ onClose }) {
  const project = useCollageStore((s) => s.project);
  const categories = useSoundStore((s) => s.categories);
  const [name, setName] = useState(project.name || 'Ses');
  const [normalize, setNormalize] = useState(true);
  const [categoryId, setCategoryId] = useState('default');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const run = async () => {
    setError('');
    if (!project.clips.length) { setError('Önce zaman çizelgesine bir ses ekle.'); return; }
    try {
      stopPlayback();
      usePadoStore.getState().setBusy(true);
      setBusy('Karıştırılıyor...');
      const rendered = await renderProject(project, { normalize });
      const mp3 = await encodeAudioBufferToMp3(rendered, (p) => setBusy(`MP3'e çevriliyor... %${Math.round(p * 100)}`), 192);
      setBusy('Kaydediliyor...');
      const filePath = await saveBytes(mp3, 'mp3');
      useSoundStore.getState().addSound({ name: name.trim() || 'Ses', filePath, categoryId });
      setBusy('');
      setDone(true);
      usePadoStore.getState().setBusy(false);
      usePadoStore.getState().celebrate();
    } catch (err) {
      setBusy('');
      setError(`Birleştirilemedi: ${err.message}`);
      usePadoStore.getState().setBusy(false);
      usePadoStore.getState().alarm();
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70" onPointerDown={(e) => e.stopPropagation()}>
      <div className="w-[420px] p-5 flex flex-col gap-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <h2 className="text-base font-bold">Tek ses olarak birleştir</h2>
        {done ? (
          <>
            <p className="text-sm" style={{ color: C.accent }}>Hazır. Yeni ses butonu eklendi.</p>
            <button type="button" onClick={onClose} className="h-10 text-sm font-bold" style={{ background: C.accent, color: '#0b0d0b', border: 0 }}>Tamam</button>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-xs" style={{ color: C.muted }}>
              Ses adı
              <input value={name} onChange={(e) => setName(e.target.value)} className="h-10 px-3 text-sm text-white outline-none" style={{ background: C.bg, border: `1px solid ${C.border}` }} />
            </label>
            <label className="flex flex-col gap-1.5 text-xs" style={{ color: C.muted }}>
              Kategori
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-10 px-2 text-sm text-white outline-none" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} style={{ accentColor: C.accent }} />
              Normalize (−1 dB)
            </label>
            {busy && <p className="text-xs font-mono" style={{ color: C.accent }}>{busy}</p>}
            {error && <p className="text-xs" style={{ color: '#ff8f84' }}>{error}</p>}
            <div className="flex justify-end gap-2">
              <Btn onClick={onClose} disabled={!!busy}>Vazgeç</Btn>
              <button type="button" onClick={run} disabled={!!busy} className="h-8 px-4 text-xs font-bold disabled:opacity-50" style={{ background: C.accent, color: '#0b0d0b', border: 0 }}>
                Birleştir
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Transport() {
  const playing = useCollageStore((s) => s.playing);
  const recording = useCollageStore((s) => s.recording);
  const position = useCollageStore((s) => s.position);
  const snap = useCollageStore((s) => s.snap);
  const px = useCollageStore((s) => s.pxPerSec);
  return (
    <div className="shrink-0 flex items-center gap-2.5 px-3 box-border" style={{ height: 56, borderBottom: `1px solid ${C.border}` }}>
      <button
        type="button" onClick={toggleRecord} title="R"
        className="h-9 px-4 text-xs font-bold flex items-center gap-2"
        style={{ background: C.red, color: '#fff', border: 0 }}
      >
        <span className="w-2.5 h-2.5" style={{ background: '#fff', borderRadius: recording ? 0 : '50%' }} />
        {recording ? 'DURDUR' : 'KAYIT'}
      </button>
      <Btn onClick={togglePlay} disabled={recording} className="!h-9">{playing && !recording ? '⏸ Duraklat' : '▶ Çal'}</Btn>
      <Btn onClick={() => { if (S().recording) finishRecordFlow(); else { stopPlayback(); S().setPosition(0); } }} className="!h-9" title="Başa dön / durdur">■</Btn>
      <span className="font-mono text-xl" style={{ color: recording ? '#ff8f84' : C.accent, minWidth: 110 }}>{fmtTime(position)}</span>
      <div className="flex-1" />
      <label className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
        Yapıştır
        <select value={snap} onChange={(e) => S().setSnap(Number(e.target.value))} className="h-8 px-2 text-xs text-white outline-none" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <option value={0}>Kapalı</option><option value={0.1}>0.1 sn</option><option value={0.25}>0.25 sn</option>
          <option value={0.5}>0.5 sn</option><option value={1}>1 sn</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
        Yakınlaştırma
        <input type="range" min="20" max="300" value={px} onChange={(e) => S().setPxPerSec(Number(e.target.value))} style={{ width: 96, accentColor: C.accent }} />
      </label>
    </div>
  );
}

export default function CollageStudio() {
  const project = useCollageStore((s) => s.project);
  const status = useCollageStore((s) => s.status);
  const canUndo = useCollageStore((s) => s.past.length > 0);
  const canRedo = useCollageStore((s) => s.future.length > 0);
  const [mergeOpen, setMergeOpen] = useState(false);

  // Çalarken kanal ayarları anında uygulanır
  useEffect(() => { player.updateTracks(project); }, [project.tracks]);

  // Çalarken klip düzenlenirse bulunduğun yerden yeniden başlat
  useEffect(() => {
    const st = S();
    if (!st.playing || st.recording) return undefined;
    const id = setTimeout(() => {
      if (S().playing && !S().recording) playFrom(player.position);
    }, 150);
    return () => clearTimeout(id);
  }, [project.clips]);

  // Kapanırken her şeyi durdur
  useEffect(() => () => {
    if (recSession) finishRecordFlow(); else player.stop();
    S().setPlaying(false);
  }, []);

  const onKey = useCallback((e) => {
    const tag = e.target?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !(tag === 'INPUT' && e.target.type === 'range')) return;
    const st = S();
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (st.selectedClipId) st.duplicateClip(st.selectedClipId); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (st.selectedClipId) { e.preventDefault(); st.deleteClip(st.selectedClipId); } }
    else if (!mod && e.key.toLowerCase() === 's') { if (st.selectedClipId) { e.preventDefault(); st.splitClip(st.selectedClipId, st.position); } }
    else if (!mod && e.key.toLowerCase() === 'r') { e.preventDefault(); toggleRecord(); }
    else if (e.key === 'Escape') {
      if (mergeOpen) setMergeOpen(false);
      else if (!st.recording) st.close();
    }
  }, [mergeOpen]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col text-white"
      style={{ background: C.bg }}
      onDragOver={swallow} onDrop={swallow}
    >
      <header className="shrink-0 flex items-center gap-3 px-5 box-border" style={{ height: 56, background: C.panel, borderBottom: `1px solid ${C.border}` }}>
        <button type="button" onClick={() => S().close()} className="text-sm font-medium" style={{ color: C.muted, background: 'transparent', border: 0 }}>← Soundboard</button>
        <div style={{ width: 1, height: 24, background: C.line }} />
        <PadoMascot size={44} />
        <input
          value={project.name} onChange={(e) => S().setName(e.target.value)} aria-label="Proje adı"
          className="h-9 px-3 text-[15px] font-semibold outline-none text-white"
          style={{ width: 240, background: C.card, border: `1px solid ${C.border}` }}
        />
        <span className="text-xs font-mono" style={{ color: C.dim }}>
          {project.tracks.length} kanal · {project.clips.length} klip · {projectEnd(project).toFixed(1)} s
        </span>
        <div className="flex-1" />
        <Btn onClick={() => S().undo()} disabled={!canUndo} title="Ctrl+Z">↶ Geri al</Btn>
        <Btn onClick={() => S().redo()} disabled={!canRedo} title="Ctrl+Y">↷ Yinele</Btn>
        <Btn onClick={() => { if (window.confirm('Projeyi sıfırla? Kanallar ve klipler silinir (ses dosyaları silinmez).')) S().newProject(); }}>Yeni</Btn>
        <button type="button" onClick={() => setMergeOpen(true)} className="h-8 px-4 text-xs font-bold" style={{ background: C.accent, color: '#0b0d0b', border: 0 }}>
          Tek ses olarak birleştir
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        <Library />
        <div className="flex-1 min-w-0 flex flex-col">
          <Transport />
          <Timeline />
        </div>
        <Inspector onMerge={() => setMergeOpen(true)} />
      </div>

      <footer className="shrink-0 flex items-center gap-6 px-4 box-border font-mono text-xs" style={{ height: 32, background: C.panel, borderTop: `1px solid ${C.border}`, color: C.dim }}>
        <span style={{ color: status ? C.accent : C.dim }}>{status || 'Hazır'}</span>
        <span className="flex-1" />
        <span style={{ color: C.muted }}>Boşluk: çal · R: kayıt · S: böl · Ctrl+D: çoğalt · Del: sil · Ctrl+Z: geri al · Esc: kapat</span>
      </footer>

      {mergeOpen && <MergeDialog onClose={() => setMergeOpen(false)} />}
    </div>
  );
}
