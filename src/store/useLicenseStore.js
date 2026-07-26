import { create } from 'zustand';

const useLicenseStore = create((set, get) => ({
  status: 'checking', // 'checking' | 'free' | 'pro'
  error: null,

  checkStatus: async () => {
    if (!window.electronAPI) { set({ status: 'free' }); return; }
    try {
      const res = await window.electronAPI.getLicenseStatus();
      set({ status: res.status === 'pro' ? 'pro' : 'free' });
    } catch (err) {
      set({ status: 'free', error: err.message });
    }
  },

  activate: async (key) => {
    if (!window.electronAPI) return { success: false, error: 'Sadece masaüstü uygulamasında kullanılabilir.' };
    set({ error: null });
    const res = await window.electronAPI.activateLicense(key.trim());
    if (res.success) set({ status: 'pro' });
    else set({ error: res.error });
    return res;
  },

  deactivate: async () => {
    if (!window.electronAPI) return;
    await window.electronAPI.deactivateLicense();
    set({ status: 'free' });
  },

  isPro: () => get().status === 'pro',
}));

export default useLicenseStore;
