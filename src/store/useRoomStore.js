import { create } from 'zustand';
import useSoundStore from './useSoundStore';

const MAX_ACTIVITY = 20;

// Ortak oda: arkadaşların tarayıcıdan gönderdiği "çal" istekleri burada toplanır.
const useRoomStore = create((set, get) => ({
  running: false,
  port: null,
  token: null,
  urls: [],
  error: null,
  activity: [], // [{ id, who, soundName, at }]

  refresh: async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.roomStatus();
    set({ running: !!res.running, port: res.port ?? null, token: res.token ?? null, urls: res.urls ?? [] });
  },

  start: async () => {
    const res = await window.electronAPI.roomStart();
    if (!res.success) {
      set({ error: res.error, running: false });
      return;
    }
    set({ running: true, port: res.port, token: res.token, urls: res.urls ?? [], error: null });
  },

  stop: async () => {
    await window.electronAPI.roomStop();
    set({ running: false, port: null, token: null, urls: [], activity: [] });
  },

  // App.jsx'ten tek sefer bağlanır (panel kapalıyken de istekler çalışsın)
  handlePlay: ({ soundId, soundName, who }) => {
    const sound = useSoundStore.getState().sounds.find((s) => s.id === soundId);
    if (!sound) return;
    useSoundStore.getState().playSound(sound);
    set((state) => ({
      activity: [{ id: `${Date.now()}-${Math.random()}`, who, soundName, at: Date.now() }, ...state.activity].slice(0, MAX_ACTIVITY),
    }));
  },
}));

export default useRoomStore;
