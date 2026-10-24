import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { voiceChatRouter } from '../audio/VoiceChatRouter';
import { audioEngine } from '../audio/AudioEngine';
import useLicenseStore from './useLicenseStore';

export const PRESET_COLORS = [
  '#7d2626', '#7d4220', '#7a5010', '#4a6318',
  '#1d6638', '#1a6060', '#1a4e78', '#1c3882',
  '#2e2882', '#521878', '#7a1e62', '#7a1e2e',
];

// ─── Color utilities ─────────────────────────────────────────────────────────
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){h=s=0;}else{
    const d=max-min;
    s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;}
    h/=6;
  }
  return{h:Math.round(h*360),s:Math.round(s*100),l:Math.round(l*100)};
}
function hslToHex(h,s,l){
  s/=100;l/=100;
  const a=s*Math.min(l,1-l);
  const f=n=>{const k=(n+h/30)%12;const c=l-a*Math.max(Math.min(k-3,9-k,1),-1);return Math.round(255*c).toString(16).padStart(2,'0');};
  return`#${f(0)}${f(8)}${f(4)}`;
}

export function randomColor(theme='dark'){
  const h=Math.floor(Math.random()*360);
  const s=42+Math.floor(Math.random()*28); // 42–70%
  const l=theme!=='light'
    ?22+Math.floor(Math.random()*22)  // 22–44% — any dark-background theme
    :44+Math.floor(Math.random()*22); // 44–66%
  return hslToHex(h,s,l);
}

export function adaptColorForTheme(hex, theme){
  if(!hex||theme!=='light') return hex;
  const{h,s,l}=hexToHsl(hex);
  return hslToHex(h, Math.min(80,s+10), Math.min(68,l+28));
}

const DEFAULT_SETTINGS = {
  globalVolume: 1,
  theme: 'dark',
  gridColumns: 5,
  voiceDeviceId: null,
  viewMode: 'grid',        // 'grid' | 'keyboard'
  keyboardLayout: '75',
  keyboardZoom: 1,
};

const DEFAULT_CATEGORIES = [
  { id: 'default', name: 'Genel', color: '#6366f1' },
];

function buildAudioUrl(filePath) {
  // blob:, data:, http:, https:, file: — zaten URL, doğrudan kullan
  if (/^(blob:|data:|https?:|file:)/.test(filePath)) return filePath;
  // Windows/Unix dosya yolu → file:// URL (Electron)
  const n = filePath.replace(/\\/g, '/');
  return /^[A-Za-z]:/.test(n) ? `file:///${n}` : `file://${n}`;
}

const useSoundStore = create((set, get) => ({
  // ─── State ──────────────────────────────────────────────────────────────
  categories: DEFAULT_CATEGORIES,
  sounds: [],
  settings: { ...DEFAULT_SETTINGS },
  activeCategory: 'all',
  searchQuery: '',
  // { [soundId]: [ { voice } ] }  — supports overlap (voice = AudioEngine Voice)
  playingSounds: {},
  // cooldown tracking { [soundId]: lastPlayedTimestamp }
  cooldownTracker: {},
  // playback queue — sounds waiting to play
  soundQueue: [],
  isSettingsOpen: false,
  isAddModalOpen: false,
  isVoiceChatOpen: false,
  isStreamOpen: false,
  editingSound: null,
  pendingImportPath: null,
  isLoaded: false,

  // ─── Data ────────────────────────────────────────────────────────────────
  loadData: async () => {
    try {
      if (window.electronAPI) {
        // Electron: IPC ile kayıtlı veriden yükle
        const data = await window.electronAPI.getData();
        if (data) {
          set({
            categories: data.categories?.length ? data.categories : DEFAULT_CATEGORIES,
            sounds: (data.sounds || []).map((s) => (s.volume > 1 ? { ...s, volume: 1 } : s)),
            settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
          });
        }
      } else {
        // Tarayıcı: localStorage'dan yükle
        const raw = localStorage.getItem('soundboard-data');
        if (raw) {
          const data = JSON.parse(raw);
          set({
            categories: data.categories?.length ? data.categories : DEFAULT_CATEGORIES,
            sounds: data.sounds || [],
            settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
          });
        }
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      set({ isLoaded: true });
      // Sesleri önceden hazırla: ilk basışta decode beklenmesin (en çok çalınan önce)
      audioEngine.warm([...get().sounds].filter((s) => s.filePath).sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 300)
        .map((s) => ({ url: buildAudioUrl(s.filePath), trimStart: s.trimStart ?? 0, trimEnd: s.trimEnd ?? null }))).catch(() => {});
      // Restore virtual device on router
      const { settings } = get();
      if (settings.voiceDeviceId) {
        voiceChatRouter.setVirtualDevice(settings.voiceDeviceId);
      }
    }
  },

  saveData: async () => {
    const { categories, sounds, settings } = get();
    try {
      if (window.electronAPI) {
        await window.electronAPI.saveData({ categories, sounds, settings });
      } else {
        // Tarayıcı: localStorage'a kaydet
        localStorage.setItem('soundboard-data', JSON.stringify({ categories, sounds, settings }));
      }
    } catch (err) {
      console.error('Save error:', err);
    }
  },

  // ─── Sounds ──────────────────────────────────────────────────────────────
  addSound: (data) => {
    const sounds = get().sounds;
    const maxOrder = sounds.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
    const s = {
      id: uuidv4(),
      name: data.name || 'Yeni Ses',
      filePath: data.filePath,
      color: data.color || randomColor(get().settings.theme),
      volume: data.volume ?? 0.8,
      shortcut: data.shortcut || '',
      categoryId: data.categoryId || 'default',
      order: maxOrder + 1,
      loop: data.loop ?? false,
      fadeIn: data.fadeIn ?? 0,
      fadeOut: data.fadeOut ?? 0,
      trimStart: data.trimStart ?? 0,
      trimEnd: data.trimEnd ?? null,
      playbackRate: data.playbackRate ?? 1,
      bass: data.bass ?? 0,
      treble: data.treble ?? 0,
      reverb: data.reverb ?? 0,
      favorite: data.favorite ?? false,
      playCount: data.playCount ?? 0,
      cooldown: data.cooldown ?? 0,
      overlap: data.overlap ?? true,
      chatCommand: data.chatCommand || '',
      credit: data.credit || null, // çevrimiçi kaynaktan geldiyse yazar/lisans/kaynak bilgisi
      createdAt: Date.now(),
    };
    set((state) => ({ sounds: [...state.sounds, s] }));
    if (s.filePath) audioEngine.preload(buildAudioUrl(s.filePath), s.trimStart, s.trimEnd);
    get().saveData();
    return s;
  },

  updateSound: (id, updates) => {
    set((state) => ({
      sounds: state.sounds.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
    const u = get().sounds.find((s) => s.id === id);
    if (u?.filePath) audioEngine.preload(buildAudioUrl(u.filePath), u.trimStart ?? 0, u.trimEnd ?? null);
    get().saveData();
  },

  deleteSound: (id) => {
    get().stopAllInstancesOf(id);
    set((state) => ({ sounds: state.sounds.filter((s) => s.id !== id) }));
    get().saveData();
  },

  toggleFavorite: (id) => {
    set((state) => ({
      sounds: state.sounds.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s)),
    }));
    get().saveData();
  },

  reorderSounds: (draggedId, overId) => {
    set((state) => {
      const sounds = [...state.sounds];
      const fromIdx = sounds.findIndex((s) => s.id === draggedId);
      const toIdx = sounds.findIndex((s) => s.id === overId);
      if (fromIdx === -1 || toIdx === -1) return {};
      const [moved] = sounds.splice(fromIdx, 1);
      sounds.splice(toIdx, 0, moved);
      // Update order field
      return { sounds: sounds.map((s, i) => ({ ...s, order: i })) };
    });
    get().saveData();
  },

  // ─── Categories ──────────────────────────────────────────────────────────
  addCategory: (name) => {
    const c = { id: uuidv4(), name, color: randomColor(get().settings.theme) };
    set((state) => ({ categories: [...state.categories, c] }));
    get().saveData();
    return c;
  },

  updateCategory: (id, updates) => {
    set((state) => ({ categories: state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)) }));
    get().saveData();
  },

  deleteCategory: (id) => {
    if (id === 'default') return;
    set((state) => ({
      categories: state.categories.filter((c) => c.id !== id),
      sounds: state.sounds.map((s) => (s.categoryId === id ? { ...s, categoryId: 'default' } : s)),
      activeCategory: state.activeCategory === id ? 'all' : state.activeCategory,
    }));
    get().saveData();
  },

  setActiveCategory: (id) => set({ activeCategory: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  // ─── Playback ────────────────────────────────────────────────────────────
  playSound: async (sound) => {
    const { settings, playingSounds, cooldownTracker } = get();
    const now = Date.now();

    // If something is playing, add to queue instead of blocking
    const anyPlaying = Object.values(playingSounds).some((instances) => instances.length > 0);
    if (anyPlaying) {
      set((state) => ({ soundQueue: [...state.soundQueue, sound] }));
      return;
    }

    // Cooldown check
    if (sound.cooldown > 0) {
      const last = cooldownTracker[sound.id] || 0;
      if (now - last < sound.cooldown * 1000) return;
    }

    // If not overlap, stop all instances first
    if (!sound.overlap) {
      get().stopAllInstancesOf(sound.id);
    }

    const url = buildAudioUrl(sound.filePath);
    const targetVol = Math.min(1, (sound.volume ?? 0.8) * (settings.globalVolume ?? 1));

    // Pro-only effects — only applied for licensed users, even if a stale/tampered-with
    // sound record on disk carries non-default values (defense in depth, not just hiding the UI).
    const isPro = useLicenseStore.getState().isPro();
    const effectiveRate = isPro ? (sound.playbackRate ?? 1) : 1; // rate also shifts pitch
    const fx = isPro
      ? { bass: sound.bass ?? 0, treble: sound.treble ?? 0, reverb: sound.reverb ?? 0 }
      : { bass: 0, treble: 0, reverb: 0 };

    let voice;
    const removeInstance = () => {
      set((state) => {
        const instances = (state.playingSounds[sound.id] || []).filter((inst) => inst.voice !== voice);
        const next = { ...state.playingSounds };
        if (instances.length === 0) delete next[sound.id];
        else next[sound.id] = instances;
        return { playingSounds: next };
      });
    };

    try {
      voice = await audioEngine.play(url, {
        volume: targetVol,
        loop: sound.loop ?? false,
        rate: effectiveRate,
        trimStart: sound.trimStart ?? 0,
        trimEnd: sound.trimEnd ?? null,
        fadeIn: sound.fadeIn ?? 0,
        fadeOut: sound.fadeOut ?? 0,
        ...fx,
        onEnded: () => {
          removeInstance();
          get()._playNextFromQueue();
        },
      });
    } catch (e) {
      console.error(`Play "${sound.name}":`, e.message);
      get()._playNextFromQueue();
      return;
    }

    set((state) => ({
      playingSounds: {
        ...state.playingSounds,
        [sound.id]: [...(state.playingSounds[sound.id] || []), { voice }],
      },
      cooldownTracker: { ...state.cooldownTracker, [sound.id]: now },
      sounds: state.sounds.map((s) => (s.id === sound.id ? { ...s, playCount: (s.playCount || 0) + 1 } : s)),
    }));
    get().saveData();
  },

  stopAllInstancesOf: (soundId) => {
    const instances = get().playingSounds[soundId] || [];
    instances.forEach(({ voice }) => voice.stop());
    set((state) => {
      const next = { ...state.playingSounds };
      delete next[soundId];
      return { playingSounds: next };
    });
  },

  stopSoundWithFade: (soundId, sound) => {
    const { playingSounds } = get();
    const instances = playingSounds[soundId] || [];
    const fadeOut = sound?.fadeOut ?? 0;

    instances.forEach(({ voice }) => voice.fadeOutAndStop(fadeOut));

    if (fadeOut <= 0) {
      set((state) => {
        const next = { ...state.playingSounds };
        delete next[soundId];
        return { playingSounds: next };
      });
    } else {
      setTimeout(() => {
        set((state) => {
          const next = { ...state.playingSounds };
          delete next[soundId];
          return { playingSounds: next };
        });
      }, fadeOut * 1000 + 100);
    }
  },

  stopAllSounds: () => {
    const { playingSounds } = get();
    Object.values(playingSounds).flat().forEach(({ voice }) => voice.stop());
    set({ playingSounds: {}, soundQueue: [] });
  },

  _playNextFromQueue: () => {
    const { soundQueue, playingSounds } = get();
    if (soundQueue.length === 0) return;
    const anyPlaying = Object.values(playingSounds).some((i) => i.length > 0);
    if (anyPlaying) return;
    const [next, ...rest] = soundQueue;
    set({ soundQueue: rest });
    get().playSound(next);
  },

  clearQueue: () => set({ soundQueue: [] }),

  removeFromQueue: (index) => set((state) => ({
    soundQueue: state.soundQueue.filter((_, i) => i !== index),
  })),

  // Update live volume for all instances of a sound
  updatePlayingVolume: (soundId, volume) => {
    const { playingSounds, settings } = get();
    const instances = playingSounds[soundId] || [];
    const v = Math.min(1, volume * (settings.globalVolume ?? 1));
    instances.forEach(({ voice }) => voice.setVolume(v));
  },

  // ─── UI State ────────────────────────────────────────────────────────────
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openAddModal: (sound = null) => set({ isAddModalOpen: true, editingSound: sound }),
  openAddModalWithFile: (filePath) => set({ isAddModalOpen: true, editingSound: null, pendingImportPath: filePath }),
  closeAddModal: () => set({ isAddModalOpen: false, editingSound: null, pendingImportPath: null }),
  openVoiceChat: () => set({ isVoiceChatOpen: true }),
  closeVoiceChat: () => set({ isVoiceChatOpen: false }),
  openStream: () => set({ isStreamOpen: true }),
  closeStream: () => set({ isStreamOpen: false }),

  updateSettings: (updates) => {
    set((state) => ({ settings: { ...state.settings, ...updates } }));
    get().saveData();

    if ('globalVolume' in updates) {
      const { playingSounds, sounds } = get();
      sounds.forEach((s) => {
        const instances = playingSounds[s.id] || [];
        instances.forEach(({ voice }) => {
          voice.setVolume(Math.min(1, (s.volume ?? 0.8) * updates.globalVolume));
        });
      });
    }
  },

  // ─── Helpers ─────────────────────────────────────────────────────────────
  getFilteredSounds: () => {
    const { sounds, activeCategory, searchQuery } = get();
    let filtered = sounds;
    let sortFn = (a, b) => (a.order ?? 0) - (b.order ?? 0);

    if (activeCategory === 'favorites') {
      filtered = filtered.filter((s) => s.favorite);
    } else if (activeCategory === 'top') {
      filtered = filtered.filter((s) => (s.playCount || 0) > 0);
      sortFn = (a, b) => (b.playCount || 0) - (a.playCount || 0);
    } else if (activeCategory !== 'all') {
      filtered = filtered.filter((s) => s.categoryId === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) => s.name.toLowerCase().includes(q) || (s.chatCommand || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...filtered].sort(sortFn);
    return activeCategory === 'top' ? sorted.slice(0, 20) : sorted;
  },

  getCooldownProgress: (soundId) => {
    const { cooldownTracker, sounds } = get();
    const sound = sounds.find((s) => s.id === soundId);
    if (!sound?.cooldown) return 1;
    const elapsed = (Date.now() - (cooldownTracker[soundId] || 0)) / 1000;
    return Math.min(1, elapsed / sound.cooldown);
  },
}));

export default useSoundStore;
