import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'soundboard-collage-project';
const MAX_HISTORY = 60;
export const MIN_CLIP = 0.05;
export const TRACK_COLORS = ['#5ea8ff', '#ff9a4d', '#c4ff00', '#c58bff', '#ff5a4d', '#6fe58f', '#ffb347'];

function newTrack(n, name) {
  return {
    id: uuidv4(),
    name: name || `Kanal ${n}`,
    color: TRACK_COLORS[(n - 1) % TRACK_COLORS.length],
    vol: 1,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
  };
}

function emptyProject() {
  return { name: 'Yeni proje', tracks: [newTrack(1), newTrack(2)], clips: [] };
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.tracks) && Array.isArray(p.clips) && p.tracks.length) return p.name === 'Yeni kolaj' ? { ...p, name: 'Yeni proje' } : p;
    }
  } catch (_) { /* bozuk kayıt — boş projeyle başla */ }
  return emptyProject();
}

let persistTimer = null;
function persist(project) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); } catch (_) { /* dolu/kapalı */ }
  }, 400);
}

const clone = (p) => JSON.parse(JSON.stringify(p));

const useCollageStore = create((set, get) => ({
  isOpen: false,
  project: loadSaved(),
  selectedClipId: null,
  past: [],
  future: [],

  // görünüm / taşıma
  pxPerSec: 80,
  snap: 0.25, // saniye, 0 = kapalı
  position: 0,
  playing: false,
  recording: false,
  recFrom: 0,
  recTrackId: null,
  recLevel: 0,
  countInOn: true,
  monitor: false,
  latencyMs: 0,
  status: '',

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setStatus: (status) => set({ status }),
  setPosition: (position) => set({ position: Math.max(0, position) }),
  setPlaying: (playing) => set({ playing }),
  setRecording: (recording, info = {}) => set({ recording, recFrom: info.from ?? 0, recTrackId: info.trackId ?? null }),
  setRecLevel: (recLevel) => set({ recLevel }),
  setPxPerSec: (pxPerSec) => set({ pxPerSec: Math.min(300, Math.max(20, pxPerSec)) }),
  setSnap: (snap) => set({ snap }),
  setCountIn: (countInOn) => set({ countInOn }),
  setMonitor: (monitor) => set({ monitor }),
  setLatency: (latencyMs) => set({ latencyMs: Math.min(500, Math.max(0, latencyMs)) }),
  select: (selectedClipId) => set({ selectedClipId }),

  snapTime: (t) => {
    const { snap } = get();
    const v = snap > 0 ? Math.round(t / snap) * snap : t;
    return Math.max(0, v);
  },

  // ─── Proje değişiklikleri ──────────────────────────────────────────────────
  // history: false → sürükleme gibi ardışık güncellemelerde (önce beginGesture çağır)
  setProject: (fn, { history = true } = {}) => {
    const cur = get().project;
    const next = fn(cur);
    if (history) set((s) => ({ past: [...s.past.slice(-(MAX_HISTORY - 1)), clone(cur)], future: [] }));
    set({ project: next });
    persist(next);
  },

  beginGesture: () => {
    const cur = get().project;
    set((s) => ({ past: [...s.past.slice(-(MAX_HISTORY - 1)), clone(cur)], future: [] }));
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [clone(project), ...future].slice(0, MAX_HISTORY) });
    persist(prev);
  },

  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    const next = future[0];
    set({ project: next, future: future.slice(1), past: [...past, clone(project)].slice(-MAX_HISTORY) });
    persist(next);
  },

  newProject: () => {
    const p = emptyProject();
    set({ project: p, past: [], future: [], selectedClipId: null, position: 0 });
    persist(p);
  },

  setName: (name) => get().setProject((p) => ({ ...p, name }), { history: false }),

  // ─── Kanallar ──────────────────────────────────────────────────────────────
  addTrack: (name) => {
    const t = newTrack(get().project.tracks.length + 1, name);
    get().setProject((p) => ({ ...p, tracks: [...p.tracks, t] }));
    return t.id;
  },

  removeTrack: (id) => {
    if (get().project.tracks.length <= 1) return;
    get().setProject((p) => ({
      ...p,
      tracks: p.tracks.filter((t) => t.id !== id),
      clips: p.clips.filter((c) => c.trackId !== id),
    }));
  },

  // vol/pan/mute/solo/isim — geri alma geçmişine girmez (gürültü yapmasın)
  updateTrack: (id, patch) => {
    get().setProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }), { history: false });
  },

  // Tek kanal kayda hazır olabilir
  armTrack: (id) => {
    get().setProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, armed: t.id === id ? !t.armed : false })),
    }), { history: false });
  },

  // ─── Klipler ───────────────────────────────────────────────────────────────
  addClip: (clip) => {
    const full = {
      id: uuidv4(),
      name: 'Klip',
      start: 0,
      offset: 0,
      gain: 1,
      fadeIn: 0,
      fadeOut: 0,
      ...clip,
    };
    get().setProject((p) => ({ ...p, clips: [...p.clips, full] }));
    set({ selectedClipId: full.id });
    return full.id;
  },

  patchClip: (id, patch, opts) => {
    get().setProject((p) => ({
      ...p,
      clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }), opts);
  },

  deleteClip: (id) => {
    get().setProject((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== id) }));
    if (get().selectedClipId === id) set({ selectedClipId: null });
  },

  duplicateClip: (id) => {
    const c = get().project.clips.find((x) => x.id === id);
    if (!c) return;
    const copy = { ...c, id: uuidv4(), start: c.start + c.dur };
    get().setProject((p) => ({ ...p, clips: [...p.clips, copy] }));
    set({ selectedClipId: copy.id });
  },

  splitClip: (id, t) => {
    const c = get().project.clips.find((x) => x.id === id);
    if (!c || t <= c.start + MIN_CLIP || t >= c.start + c.dur - MIN_CLIP) return;
    const leftDur = t - c.start;
    const right = {
      ...c,
      id: uuidv4(),
      start: t,
      offset: c.offset + leftDur,
      dur: c.dur - leftDur,
      fadeIn: 0,
    };
    get().setProject((p) => ({
      ...p,
      clips: p.clips.flatMap((x) => (x.id === id ? [{ ...x, dur: leftDur, fadeOut: 0 }, right] : [x])),
    }));
    set({ selectedClipId: right.id });
  },
}));

export default useCollageStore;
