import { create } from 'zustand';
import { voiceChatRouter, VoiceChatRouter } from '../audio/VoiceChatRouter';
import useSoundStore from './useSoundStore';

const useVoiceChatStore = create((set, get) => ({
  enabled: false,
  virtualDeviceId: null,
  micPassthrough: false,
  outputDevices: [],
  error: null,

  loadDevices: async () => {
    try {
      const devices = await VoiceChatRouter.getOutputDevices();
      set({ outputDevices: devices, error: null });

      // Auto-configure: if nothing selected yet, pick the first virtual cable found
      if (!get().virtualDeviceId) {
        const cable = devices.find((d) => VoiceChatRouter.isVirtualCableLabel(d.label));
        if (cable) {
          await get().setVirtualDevice(cable.id);
          get().setEnabled(true);
        }
      }
    } catch (err) {
      set({ error: err.message });
    }
  },

  setVirtualDevice: async (deviceId) => {
    set({ virtualDeviceId: deviceId || null, error: null });
    voiceChatRouter.setVirtualDevice(deviceId || null);
    useSoundStore.getState().updateSettings({ voiceDeviceId: deviceId || null });
    const { micPassthrough } = get();
    if (micPassthrough && deviceId) {
      try {
        await voiceChatRouter.setMicPassthrough(false);
        await voiceChatRouter.setMicPassthrough(true);
      } catch (err) {
        set({ error: err.message });
      }
    }
  },

  setMicPassthrough: async (enabled) => {
    const { virtualDeviceId } = get();
    if (enabled && !virtualDeviceId) {
      set({ error: 'Önce bir sanal ses cihazı seçin.' });
      return;
    }
    try {
      await voiceChatRouter.setMicPassthrough(enabled);
      set({ micPassthrough: enabled, error: null });
    } catch (err) {
      set({ error: err.message, micPassthrough: false });
    }
  },

  setEnabled: (val) => {
    set({ enabled: val });
    if (!val) {
      voiceChatRouter.setVirtualDevice(null);
      voiceChatRouter.setMicPassthrough(false).catch(() => {});
      set({ micPassthrough: false });
    } else {
      const { virtualDeviceId } = get();
      voiceChatRouter.setVirtualDevice(virtualDeviceId);
    }
  },
}));

export default useVoiceChatStore;
