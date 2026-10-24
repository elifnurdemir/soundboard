import { create } from 'zustand';

// İlk kurulum sihirbazının açık/kapalı durumu. İlk açılışta App otomatik açar, Ses Yönlendirme panelinden tekrar açılabilir.
const useSetupStore = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export default useSetupStore;
