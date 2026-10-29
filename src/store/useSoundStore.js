import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { voiceChatRouter } from '../audio/VoiceChatRouter';
import { audioEngine } from '../audio/AudioEngine';
import useLicenseStore from './useLicenseStore';
import { splitExpired, unreferencedFiles, orphanToSound } from './trash';
import { normalizationGain, targetLufsFor } from '../audio/loudness';

export const STOP_ALL_ID = '__stop_all__';

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
  stopAllShortcut: 'Ctrl+Alt+X', // her yerde çalışan "hepsini durdur" kısayolu
  buttonConcept: 'classic',      // buton konsepti: 'classic' | 'sokak'
  normalize: false,              // sesleri eşitle: hepsi aynı algılanan yükseklikte çalar (LUFS)
  normalizeTarget: 'normal',     // 'quiet' | 'normal' | 'loud' (bkz. LOUDNESS_TARGETS)
  tts: { voiceId: '', rate: 1, pitch: 1 }, // yazıdan sese: son seçilen ses ve ayarlar
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

// Ölçüm hangi dosya ve kırpma için yapıldı: ses kırpılınca ya da dosyası değişince yeniden ölçülür
export const loudnessKey = (s) => `${s.filePath}|${s.trimStart ?? 0}|${s.trimEnd ?? ''}`;

// Eşitleme açıksa sesin çarpılacağı kazanç (ölçülmemişse 1)
function normGain(sound, settings) {
  if (!settings.normalize || sound.loudness?.key !== loudnessKey(sound)) return 1;
  return normalizationGain(sound.loudness, targetLufsFor(settings.normalizeTarget));
}

// Çalma ses seviyesi en çok %100; eşitleme kazancı bunun üstüne uygulanır (tepe tavanı loudness.js'de)
const playVolume = (sound, settings, norm) => Math.min(1, (sound.volume ?? 0.8) * (settings.globalVolume ?? 1)) * norm;

// Ses kaydını varsayılanlarla tamamlar. Yeni ses eklerken ve çöp kutusundan geri alırken ortak kullanılır.
function buildSound(data, order, theme) {
  return {
    id: data.id || uuidv4(),
    name: data.name || 'Yeni Ses',
    filePath: data.filePath,
    color: data.color || randomColor(theme),
    volume: data.volume ?? 0.8,
    shortcut: data.shortcut || '',
    categoryId: data.categoryId || 'default',
    order,
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
    image: data.image || '',
    noColor: data.noColor ?? false,
    credit: data.credit || null, // çevrimiçi kaynaktan geldiyse yazar/lisans/kaynak bilgisi
    loudness: data.loudness || null, // { lufs, peak, key } — eşitleme ölçümü
    createdAt: data.createdAt || Date.now(),
  };
}

// Kullanılmayan dosyaları diskten siler. Başka bir ses ya da çöp kutusu kaydı hâlâ kullanıyorsa dokunmaz.
async function deleteUnusedFiles(removed, stillUsed) {
  const files = unreferencedFiles(removed, stillUsed);
  const total = removed.flatMap((s) => [s.filePath, s.image]).filter(Boolean).length;
  if (!window.electronAPI?.deleteFiles || !files.length) return { deleted: 0, failed: 0, shared: total > 0 && !files.length };
  const res = await window.electronAPI.deleteFiles(files);
  return { deleted: res?.deleted?.length || 0, failed: res?.failed?.length || 0, shared: files.length < total };
}

const useSoundStore = create((set, get) => ({
  // ─── State ──────────────────────────────────────────────────────────────
  categories: DEFAULT_CATEGORIES,
  sounds: [],
  // Çöp kutusu: [{ trashId, sound, deletedAt }] — 30 gün sonra dosyalarıyla birlikte silinir
  trash: [],
  confirmDialog: null, // { title, message, confirmLabel, danger, onConfirm }
  toast: null,         // { id, message, trashId? } — trashId varsa "geri al" düğmesi çıkar
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
  isTtsOpen: false,
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
            trash: Array.isArray(data.trash) ? data.trash : [],
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
            trash: Array.isArray(data.trash) ? data.trash : [],
            settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
          });
        }
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      set({ isLoaded: true });
      // 30 günü dolan silinmişleri dosyalarıyla birlikte temizle
      get().purgeExpiredTrash().catch((e) => console.error('Trash purge:', e));
      // Sesleri önceden hazırla: ilk basışta decode beklenmesin (en çok çalınan önce)
      audioEngine.warm([...get().sounds].filter((s) => s.filePath).sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 300)
        .map((s) => ({ url: buildAudioUrl(s.filePath), trimStart: s.trimStart ?? 0, trimEnd: s.trimEnd ?? null }))).catch(() => {});
      if (get().settings.normalize) get().analyzeAll();
      // Restore virtual device on router
      const { settings } = get();
      if (settings.voiceDeviceId) {
        voiceChatRouter.setVirtualDevice(settings.voiceDeviceId);
      }
    }
  },

  saveData: async () => {
    const { categories, sounds, settings, trash } = get();
    try {
      if (window.electronAPI) {
        await window.electronAPI.saveData({ categories, sounds, settings, trash });
      } else {
        // Tarayıcı: localStorage'a kaydet
        localStorage.setItem('soundboard-data', JSON.stringify({ categories, sounds, settings, trash }));
      }
    } catch (err) {
      console.error('Save error:', err);
    }
  },

  // ─── Sounds ──────────────────────────────────────────────────────────────
  addSound: (data) => {
    const sounds = get().sounds;
    const maxOrder = sounds.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
    const s = buildSound({ ...data, id: undefined, createdAt: undefined }, maxOrder + 1, get().settings.theme);
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

  // Silme: sesi çöp kutusuna taşır (dosya yerinde kalır, 30 gün kurtarılabilir)
  deleteSound: (id) => {
    const sound = get().sounds.find((s) => s.id === id);
    if (!sound) return;
    get().stopAllInstancesOf(id);
    const entry = { trashId: uuidv4(), sound, deletedAt: Date.now() };
    set((state) => ({
      sounds: state.sounds.filter((s) => s.id !== id),
      trash: [entry, ...state.trash],
      toast: { id: entry.trashId, message: `"${sound.name}" çöp kutusuna taşındı`, trashId: entry.trashId },
    }));
    get().saveData();
  },

  // Sesi ve dosyasını kalıcı siler (çöp kutusuna uğramaz)
  permanentlyDeleteSound: async (id) => {
    const sound = get().sounds.find((s) => s.id === id);
    if (!sound) return;
    get().stopAllInstancesOf(id);
    set((state) => ({ sounds: state.sounds.filter((s) => s.id !== id) }));
    get().saveData();
    const { sounds, trash } = get();
    const r = await deleteUnusedFiles([sound], [...sounds, ...trash.map((t) => t.sound)]);
    get().showToast(
      r.failed ? `"${sound.name}" silindi ama dosya silinemedi`
        : r.shared ? `"${sound.name}" silindi (dosyası başka bir sesle paylaşıldığı için korundu)`
        : `"${sound.name}" ve dosyası silindi`
    );
  },

  restoreFromTrash: (trashId) => {
    const entry = get().trash.find((t) => t.trashId === trashId);
    if (!entry) return;
    const { sounds, categories, settings } = get();
    const maxOrder = sounds.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
    const categoryId = categories.some((c) => c.id === entry.sound.categoryId) ? entry.sound.categoryId : 'default';
    const restored = buildSound({ ...entry.sound, categoryId }, maxOrder + 1, settings.theme);
    set((state) => ({
      sounds: [...state.sounds, restored],
      trash: state.trash.filter((t) => t.trashId !== trashId),
      toast: state.toast?.trashId === trashId ? null : state.toast,
    }));
    if (restored.filePath) audioEngine.preload(buildAudioUrl(restored.filePath), restored.trimStart, restored.trimEnd);
    get().saveData();
  },

  // Çöp kutusundan seçili kayıtları dosyalarıyla birlikte kalıcı siler
  deleteFromTrash: async (trashIds) => {
    const ids = new Set(trashIds);
    const removed = get().trash.filter((t) => ids.has(t.trashId)).map((t) => t.sound);
    if (!removed.length) return { deleted: 0, failed: 0, shared: false };
    set((state) => ({ trash: state.trash.filter((t) => !ids.has(t.trashId)) }));
    get().saveData();
    const { sounds, trash } = get();
    return deleteUnusedFiles(removed, [...sounds, ...trash.map((t) => t.sound)]);
  },

  emptyTrash: async () => {
    const r = await get().deleteFromTrash(get().trash.map((t) => t.trashId));
    get().showToast(r.failed ? 'Çöp kutusu boşaltıldı ama bazı dosyalar silinemedi' : 'Çöp kutusu boşaltıldı');
  },

  purgeExpiredTrash: async () => {
    const { expired } = splitExpired(get().trash);
    if (expired.length) await get().deleteFromTrash(expired.map((t) => t.trashId));
  },

  // Hiçbir sese bağlı olmayan dosyaları çöp kutusuna koyar (30 gün geri alınabilir)
  trashOrphanFiles: (files) => {
    const known = new Set(get().trash.map((t) => String(t.sound.filePath).toLowerCase()));
    const now = Date.now();
    const entries = files
      .filter((f) => !known.has(String(f.path).toLowerCase()))
      .map((f) => ({ trashId: uuidv4(), sound: orphanToSound(f, uuidv4()), deletedAt: now, orphan: true }));
    if (!entries.length) return 0;
    set((state) => ({ trash: [...entries, ...state.trash] }));
    get().saveData();
    return entries.length;
  },

  // Kayıt dışı dosyaları doğrudan kalıcı siler
  deleteOrphanFiles: async (files) => {
    if (!window.electronAPI?.deleteFiles || !files.length) return 0;
    const res = await window.electronAPI.deleteFiles(files.map((f) => f.path));
    return res?.deleted?.length || 0;
  },

  showToast: (message, trashId) => set({ toast: { id: uuidv4(), message, trashId } }),
  clearToast: () => set({ toast: null }),
  askConfirm: (dialog) => set({ confirmDialog: dialog }),
  closeConfirm: () => set({ confirmDialog: null }),

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

  // ─── Ses paketleri (.padopack) ───────────────────────────────────────────
  exportCategoryPack: async (categoryId) => {
    const { categories, sounds } = get();
    const category = categories.find((c) => c.id === categoryId);
    if (!category || !window.electronAPI?.exportPack) return;
    const list = sounds.filter((s) => s.categoryId === categoryId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const res = await window.electronAPI.exportPack({ category, sounds: list });
    if (res?.canceled) return;
    if (!res?.success) { get().showToast(res?.error || 'Paket kaydedilemedi'); return; }
    get().showToast(`"${category.name}" paketi kaydedildi: ${res.count} ses${res.skipped ? ` (${res.skipped} sesin dosyası bulunamadı)` : ''}`);
  },

  // filePath yoksa dosya seçme penceresi açılır. Paket her zaman yeni bir kategori olarak eklenir
  importPack: async (filePath) => {
    if (!window.electronAPI?.importPack) return;
    const res = await window.electronAPI.importPack(filePath);
    if (res?.canceled) return;
    if (!res?.success) { get().showToast(res?.error || 'Paket yüklenemedi'); return; }
    const { category, sounds: packSounds } = res.data;
    const taken = new Set(get().categories.map((c) => c.name.toLocaleLowerCase('tr')));
    let name = category.name, i = 2;
    while (taken.has(name.toLocaleLowerCase('tr'))) name = `${category.name} (${i++})`;
    const cat = { id: uuidv4(), name, color: category.color || randomColor(get().settings.theme) };
    const theme = get().settings.theme;
    let order = get().sounds.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
    const added = packSounds.map((d) => buildSound({ ...d, categoryId: cat.id }, ++order, theme));
    set((state) => ({ categories: [...state.categories, cat], sounds: [...state.sounds, ...added], activeCategory: cat.id }));
    added.forEach((s) => audioEngine.preload(buildAudioUrl(s.filePath), s.trimStart, s.trimEnd));
    get().saveData();
    if (get().settings.normalize) get().analyzeAll();
    get().showToast(`"${name}" paketi yüklendi: ${added.length} ses`);
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
    // Eşitleme açık ama ses henüz ölçülmediyse ilk çalışta ölçülür (bir kez; sonra kayıtta durur)
    let measured = sound;
    if (settings.normalize && sound.loudness?.key !== loudnessKey(sound)) {
      measured = (await get().measureSound(sound.id)) || sound;
    }
    const norm = normGain(measured, settings);
    const targetVol = playVolume(sound, settings, norm);

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
        [sound.id]: [...(state.playingSounds[sound.id] || []), { voice, norm }],
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
    instances.forEach(({ voice, norm }) => voice.setVolume(playVolume({ volume }, settings, norm ?? 1)));
  },

  // Sesin yüksekliğini ölçüp kaydına yazar. Dönen: güncel ses kaydı (ölçülemezse null)
  measureSound: async (id) => {
    const sound = get().sounds.find((s) => s.id === id);
    if (!sound?.filePath) return null;
    try {
      const key = loudnessKey(sound);
      const { lufs, peak } = await audioEngine.analyze(buildAudioUrl(sound.filePath), sound.trimStart ?? 0, sound.trimEnd ?? null);
      // -Infinity JSON'a yazılamaz; tamamen sessiz ses null lufs ile saklanır (kazanç 1)
      const loudness = { lufs: Number.isFinite(lufs) ? lufs : null, peak, key };
      set((state) => ({ sounds: state.sounds.map((s) => (s.id === id ? { ...s, loudness } : s)) }));
      return get().sounds.find((s) => s.id === id) || null;
    } catch (e) {
      console.warn(`Ölçülemedi "${sound.name}":`, e.message);
      return null;
    }
  },

  // Ölçülmemiş tüm sesleri arka planda sırayla ölçer (eşitleme açılınca ve açılışta)
  _analyzing: false,
  analyzeAll: async () => {
    if (get()._analyzing) return;
    set({ _analyzing: true });
    try {
      let changed = 0;
      for (const s of get().sounds) {
        if (!get().settings.normalize) break;
        if (!s.filePath || s.loudness?.key === loudnessKey(s)) continue;
        if (await get().measureSound(s.id)) changed++;
        await new Promise((r) => setTimeout(r, 30)); // arayüz takılmasın
      }
      if (changed) get().saveData();
    } finally {
      set({ _analyzing: false });
    }
  },

  // ─── UI State ────────────────────────────────────────────────────────────
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openAddModal: (sound = null) => set({ isAddModalOpen: true, editingSound: sound }),
  openAddModalWithFile: (filePath, name = null) => set({ isAddModalOpen: true, editingSound: null, pendingImportPath: filePath, pendingImportName: name }),
  closeAddModal: () => set({ isAddModalOpen: false, editingSound: null, pendingImportPath: null, pendingImportName: null }),
  openVoiceChat: () => set({ isVoiceChatOpen: true }),
  closeVoiceChat: () => set({ isVoiceChatOpen: false }),
  openStream: () => set({ isStreamOpen: true }),
  closeStream: () => set({ isStreamOpen: false }),
  openTts: () => set({ isTtsOpen: true }),
  closeTts: () => set({ isTtsOpen: false }),

  updateSettings: (updates) => {
    set((state) => ({ settings: { ...state.settings, ...updates } }));
    get().saveData();

    if ('globalVolume' in updates) {
      const { playingSounds, sounds, settings } = get();
      sounds.forEach((s) => {
        const instances = playingSounds[s.id] || [];
        instances.forEach(({ voice, norm }) => voice.setVolume(playVolume(s, settings, norm ?? 1)));
      });
    }
    if (updates.normalize) get().analyzeAll();
  },

  // ─── Helpers ─────────────────────────────────────────────────────────────
  getFilteredSounds: () => {
    const { sounds, activeCategory, searchQuery, categories } = get();
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
      const catName = (id) => (categories.find((c) => c.id === id)?.name || '').toLowerCase();
      filtered = filtered.filter(
        (s) => s.name.toLowerCase().includes(q)
          || (s.chatCommand || '').toLowerCase().includes(q)
          || (s.shortcut || '').toLowerCase().includes(q)
          || catName(s.categoryId).includes(q)
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
