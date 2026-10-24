import { create } from 'zustand';
import { playPreview, stopPreview } from '../audio/onlinePreview';
import useSoundStore from './useSoundStore';

// Çevrimiçi ses kütüphanesi durumu (Openverse, CC0). Hem ana board'daki "Çevrimiçi sesler" görünümü
// hem Stüdyo'daki "Çevrimiçi" sekmesi aynı deposu kullanır.
export const SUGGESTIONS = ['airhorn', 'explosion', 'laugh', 'applause', 'door', 'rain', 'whoosh', 'click', 'bell', 'drum'];

const creditOf = (item) => ({
  title: item.title, creator: item.creator, license: item.license, licenseUrl: item.licenseUrl, sourceUrl: item.sourceUrl,
});

const useOnlineStore = create((set, get) => ({
  query: '',
  results: [],
  page: 1,
  hasMore: false,
  total: 0,
  loading: false,
  loadingKind: null, // 'search' | 'more'
  error: null,
  quota: null,
  searched: false,
  playingId: null,
  downloading: {}, // id → true
  saved: {}, // id → dosya yolu (bu oturumda indirilenler)
  added: {}, // id → true (yerel kütüphaneye eklenenler)

  search: async (q) => {
    const query = String(q ?? get().query).trim();
    if (!query) return;
    if (!window.electronAPI?.onlineSearch) { set({ error: 'Çevrimiçi sesler sadece masaüstü uygulamasında çalışır.', searched: true }); return; }
    get().stop();
    set({ query, loading: true, loadingKind: 'search', error: null, results: [], hasMore: false, total: 0 });
    const res = await window.electronAPI.onlineSearch(query, 1);
    if (!res.success) { set({ loading: false, error: res.error, quota: res.quota ?? get().quota, searched: true }); return; }
    set({ results: res.items, page: 1, hasMore: res.hasMore, total: res.total, loading: false, searched: true, quota: res.quota ?? get().quota });
  },

  loadMore: async () => {
    const { query, page, loading, hasMore } = get();
    if (loading || !hasMore) return;
    set({ loading: true, loadingKind: 'more', error: null });
    const res = await window.electronAPI.onlineSearch(query, page + 1);
    if (!res.success) { set({ loading: false, error: res.error, quota: res.quota ?? get().quota }); return; }
    set((s) => ({
      results: [...s.results, ...res.items.filter((n) => !s.results.some((o) => o.id === n.id))],
      page: page + 1, hasMore: res.hasMore, loading: false, quota: res.quota ?? s.quota,
    }));
  },

  togglePreview: (item) => {
    if (get().playingId === item.id) { get().stop(); return; }
    set({ playingId: item.id });
    playPreview(item.id, item.previewUrl, (err) => {
      if (get().playingId === item.id) set({ playingId: null, error: err ? 'Önizleme çalınamadı. Başka bir ses dene.' : get().error });
    });
  },

  stop: () => { stopPreview(); set({ playingId: null }); },

  // İndirme sadece sesi kullanmak istediğinde olur (önizleme indirme değildir). Aynı sesi iki kez indirmez.
  fetchFile: async (item) => {
    const known = get().saved[item.id];
    if (known) return known;
    set((s) => ({ downloading: { ...s.downloading, [item.id]: true }, error: null }));
    try {
      const res = await window.electronAPI.onlineDownload(item);
      if (!res.success) throw new Error(res.error || 'İndirilemedi');
      set((s) => ({ saved: { ...s.saved, [item.id]: res.destPath } }));
      return res.destPath;
    } catch (err) {
      set({ error: err.message });
      return null;
    } finally {
      set((s) => { const d = { ...s.downloading }; delete d[item.id]; return { downloading: d }; });
    }
  },

  // Yerel kütüphaneye (soundboard butonu olarak) ekler
  addToLibrary: async (item) => {
    const filePath = await get().fetchFile(item);
    if (!filePath) return null;
    const sound = useSoundStore.getState().addSound({ name: item.title, filePath, credit: creditOf(item) });
    set((s) => ({ added: { ...s.added, [item.id]: true } }));
    return sound;
  },
}));

export { creditOf };
export default useOnlineStore;
