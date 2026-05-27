import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { voiceChatRouter } from '../audio/VoiceChatRouter';

export const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
];

const DEFAULT_SETTINGS = {
  globalVolume: 1,
  theme: 'dark',
  gridColumns: 5,
  voiceDeviceId: null,
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

// Smooth volume ramp (fade in/out)
function rampVolume(audio, fromVol, toVol, durationMs, onDone) {
  if (durationMs <= 0) {
    audio.volume = Math.min(1, toVol);
    onDone?.();
    return;
  }
  const steps = Math.ceil(durationMs / 16); // ~60fps
  const delta = (toVol - fromVol) / steps;
  let step = 0;
  audio.volume = Math.min(1, Math.max(0, fromVol));
  const id = setInterval(() => {
    step++;
    const v = fromVol + delta * step;
    audio.volume = Math.min(1, Math.max(0, v));
    if (step >= steps) {
      audio.volume = Math.min(1, Math.max(0, toVol));
      clearInterval(id);
      onDone?.();
    }
  }, 16);
  return id;
}

const useSoundStore = create((set, get) => ({
  // ─── State ──────────────────────────────────────────────────────────────
  categories: DEFAULT_CATEGORIES,
  sounds: [],
  settings: { ...DEFAULT_SETTINGS },
  activeCategory: 'all',
  searchQuery: '',
  // { [soundId]: [ { audio, vcAudio, fadeIntervalId } ] }  — supports overlap
  playingSounds: {},
  // cooldown tracking { [soundId]: lastPlayedTimestamp }
  cooldownTracker: {},
  isSettingsOpen: false,
  isAddModalOpen: false,
  isVoiceChatOpen: false,
  isStreamOpen: false,
  editingSound: null,
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
            sounds: data.sounds || [],
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
      color: data.color || PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      volume: data.volume ?? 0.8,
      shortcut: data.shortcut || '',
      categoryId: data.categoryId || 'default',
      order: maxOrder + 1,
      loop: data.loop ?? false,
      fadeIn: data.fadeIn ?? 0,
      fadeOut: data.fadeOut ?? 0,
      cooldown: data.cooldown ?? 0,
      overlap: data.overlap ?? true,
      chatCommand: data.chatCommand || '',
      createdAt: Date.now(),
    };
    set((state) => ({ sounds: [...state.sounds, s] }));
    get().saveData();
    return s;
  },

  updateSound: (id, updates) => {
    set((state) => ({
      sounds: state.sounds.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
    get().saveData();
  },

  deleteSound: (id) => {
    get().stopAllInstancesOf(id);
    set((state) => ({ sounds: state.sounds.filter((s) => s.id !== id) }));
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
    const c = { id: uuidv4(), name, color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)] };
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

    // Block if any sound is currently playing
    const anyPlaying = Object.values(playingSounds).some((instances) => instances.length > 0);
    if (anyPlaying) return;

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

    const audio = new Audio(url);
    audio.loop = sound.loop ?? false;

    // Fade in
    if (sound.fadeIn > 0) {
      audio.volume = 0;
      audio.addEventListener('canplay', () => {
        rampVolume(audio, 0, targetVol, (sound.fadeIn ?? 0) * 1000);
      }, { once: true });
    } else {
      audio.volume = targetVol;
    }

    // Cleanup on end
    const cleanup = () => {
      set((state) => {
        const instances = (state.playingSounds[sound.id] || []).filter((inst) => inst.audio !== audio);
        const next = { ...state.playingSounds };
        if (instances.length === 0) delete next[sound.id];
        else next[sound.id] = instances;
        return { playingSounds: next };
      });
    };

    if (!sound.loop) {
      audio.addEventListener('ended', cleanup);
    }
    audio.addEventListener('error', cleanup);

    // Fade out before end
    if (!sound.loop && sound.fadeOut > 0) {
      audio.addEventListener('timeupdate', () => {
        const remaining = audio.duration - audio.currentTime;
        if (remaining > 0 && remaining <= (sound.fadeOut ?? 0) && audio.volume > 0) {
          const instances = get().playingSounds[sound.id] || [];
          const inst = instances.find((i) => i.audio === audio);
          if (inst && !inst._fadingOut) {
            inst._fadingOut = true;
            rampVolume(audio, audio.volume, 0, remaining * 1000);
          }
        }
      });
    }

    audio.play().catch((e) => {
      console.error(`Play "${sound.name}":`, e.message);
      cleanup();
    });

    // Voice chat: also play on virtual device
    let vcAudio = null;
    try {
      vcAudio = await voiceChatRouter.playOnVirtualDevice(url, targetVol, sound.loop ?? false);
    } catch (_) {}

    const instance = { audio, vcAudio, _fadingOut: false };

    set((state) => ({
      playingSounds: {
        ...state.playingSounds,
        [sound.id]: [...(state.playingSounds[sound.id] || []), instance],
      },
      cooldownTracker: { ...state.cooldownTracker, [sound.id]: now },
    }));
  },

  stopAllInstancesOf: (soundId) => {
    const { playingSounds } = get();
    const instances = playingSounds[soundId] || [];
    instances.forEach(({ audio, vcAudio }) => {
      audio.pause();
      audio.src = '';
      if (vcAudio) { vcAudio.pause(); vcAudio.src = ''; }
    });
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

    instances.forEach(({ audio, vcAudio }) => {
      if (fadeOut > 0) {
        rampVolume(audio, audio.volume, 0, fadeOut * 1000, () => {
          audio.pause(); audio.src = '';
          if (vcAudio) { vcAudio.pause(); vcAudio.src = ''; }
        });
        if (vcAudio) rampVolume(vcAudio, vcAudio.volume, 0, fadeOut * 1000);
      } else {
        audio.pause(); audio.src = '';
        if (vcAudio) { vcAudio.pause(); vcAudio.src = ''; }
      }
    });

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
    Object.values(playingSounds).flat().forEach(({ audio, vcAudio }) => {
      audio.pause(); audio.src = '';
      if (vcAudio) { vcAudio.pause(); vcAudio.src = ''; }
    });
    set({ playingSounds: {} });
  },

  // Update live volume for all instances of a sound
  updatePlayingVolume: (soundId, volume) => {
    const { playingSounds, settings } = get();
    const instances = playingSounds[soundId] || [];
    const v = Math.min(1, volume * (settings.globalVolume ?? 1));
    instances.forEach(({ audio }) => { audio.volume = v; });
  },

  // ─── UI State ────────────────────────────────────────────────────────────
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openAddModal: (sound = null) => set({ isAddModalOpen: true, editingSound: sound }),
  closeAddModal: () => set({ isAddModalOpen: false, editingSound: null }),
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
        instances.forEach(({ audio }) => {
          audio.volume = Math.min(1, (s.volume ?? 0.8) * updates.globalVolume);
        });
      });
    }
  },

  // ─── Helpers ─────────────────────────────────────────────────────────────
  getFilteredSounds: () => {
    const { sounds, activeCategory, searchQuery } = get();
    let filtered = sounds;
    if (activeCategory !== 'all') {
      filtered = filtered.filter((s) => s.categoryId === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) => s.name.toLowerCase().includes(q) || (s.chatCommand || '').toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
