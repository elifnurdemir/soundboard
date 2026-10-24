import { create } from 'zustand';

// Pado'nun tek seferlik hareketleri ve geçici ruh halleri (kutlama, dikkat).
// Süreğen ruh halleri (çalıyor, kayıt...) uygulamanın gerçek durumundan türetilir: bkz. Pado.jsx > usePadoMood.
export const GESTURES = { hello: 2400, nod: 2300, brow: 2900, wink: 1700 };
const NAMES = Object.keys(GESTURES);
const SLEEP_AFTER_MS = 5 * 60 * 1000;

let clearTimer = null;

const usePadoStore = create((set, get) => ({
  gesture: null, // { name, key } — key her tetiklemede değişir, animasyon baştan başlasın diye
  celebrateUntil: 0,
  alarmUntil: 0,
  busy: false, // MP3'e çevirme / birleştirme sürüyor
  lastActive: Date.now(),

  poke: (name) => {
    const pick = name || NAMES[Math.floor(Math.random() * NAMES.length)];
    set({ gesture: { name: pick, key: Date.now() }, lastActive: Date.now() });
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => set({ gesture: null }), GESTURES[pick] + 50);
  },
  celebrate: (ms = 4000) => set({ celebrateUntil: Date.now() + ms, lastActive: Date.now() }),
  alarm: (ms = 4000) => set({ alarmUntil: Date.now() + ms, lastActive: Date.now() }),
  setBusy: (busy) => set({ busy }),
  touch: () => { if (Date.now() - get().lastActive > 1000) set({ lastActive: Date.now() }); },
  isAsleep: (now = Date.now()) => now - get().lastActive > SLEEP_AFTER_MS,
}));

// Kullanıcı bir şey yapınca uyanır (bir kez kurulur)
if (typeof window !== 'undefined' && !window.__padoWake) {
  window.__padoWake = true;
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => usePadoStore.getState().touch(), { passive: true }));
}

export default usePadoStore;
