import { create } from 'zustand';

/**
 * Stream store: Twitch chat commands + OBS WebSocket integration
 */
const useStreamStore = create((set, get) => ({
  // ─── Twitch ──────────────────────────────────────────────────────────────
  twitchChannel: '',
  twitchConnected: false,
  twitchError: null,
  _twitchWs: null,

  // ─── OBS ─────────────────────────────────────────────────────────────────
  obsHost: 'localhost',
  obsPort: 4455,
  obsPassword: '',
  obsConnected: false,
  obsError: null,
  _obsWs: null,

  // ─── Hotkey Profiles ─────────────────────────────────────────────────────
  hotkeyProfiles: [{ id: 'default', name: 'Varsayılan', shortcuts: {} }],
  activeProfileId: 'default',

  // ─── Twitch Actions ──────────────────────────────────────────────────────
  connectTwitch: async (channel) => {
    const { _twitchWs } = get();
    if (_twitchWs) {
      _twitchWs.close();
    }

    set({ twitchChannel: channel, twitchError: null });

    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    ws.onopen = () => {
      ws.send(`NICK justinfan${Math.floor(Math.random() * 99999)}`);
      ws.send(`JOIN #${channel.toLowerCase()}`);
      set({ twitchConnected: true, _twitchWs: ws, twitchError: null });
    };

    ws.onmessage = (e) => {
      const raw = e.data;
      // Keep connection alive
      if (raw.startsWith('PING')) {
        ws.send('PONG :tmi.twitch.tv');
        return;
      }
      // Parse PRIVMSG
      const match = raw.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
      if (match) {
        const message = match[2].trim();
        get()._handleChatMessage(message);
      }
    };

    ws.onclose = () => {
      set({ twitchConnected: false, _twitchWs: null });
    };

    ws.onerror = (e) => {
      set({ twitchError: 'Bağlantı hatası. Kanal adını kontrol edin.', twitchConnected: false });
    };
  },

  disconnectTwitch: () => {
    const { _twitchWs } = get();
    if (_twitchWs) _twitchWs.close();
    set({ twitchConnected: false, _twitchWs: null });
  },

  _handleChatMessage: (message) => {
    if (!message.startsWith('!')) return;
    const command = message.slice(1).split(' ')[0].toLowerCase().trim();
    // This will be called by App.jsx with the sounds list
    get().lastChatCommand = command;
    get()._chatCommandListeners?.forEach((fn) => fn(command));
  },

  _chatCommandListeners: [],
  onChatCommand: (fn) => {
    set((state) => ({
      _chatCommandListeners: [...(state._chatCommandListeners || []), fn],
    }));
    return () =>
      set((state) => ({
        _chatCommandListeners: state._chatCommandListeners.filter((f) => f !== fn),
      }));
  },

  // ─── OBS Actions ─────────────────────────────────────────────────────────
  connectOBS: async (host, port, password) => {
    const { _obsWs } = get();
    if (_obsWs) _obsWs.close();

    set({ obsHost: host, obsPort: port, obsPassword: password, obsError: null });

    try {
      const ws = new WebSocket(`ws://${host}:${port}`);

      ws.onopen = () => {
        set({ _obsWs: ws });
      };

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        // OBS WebSocket v5 protocol
        if (data.op === 0) {
          // Hello — send Identify
          const identify = {
            op: 1,
            d: { rpcVersion: 1, eventSubscriptions: 0 },
          };
          if (password && data.d?.authentication) {
            // Basic auth would go here
          }
          ws.send(JSON.stringify(identify));
        } else if (data.op === 2) {
          // Identified — connected!
          set({ obsConnected: true, obsError: null });
        }
      };

      ws.onclose = () => {
        set({ obsConnected: false, _obsWs: null });
      };

      ws.onerror = () => {
        set({ obsError: `OBS'e bağlanılamadı (${host}:${port}). OBS WebSocket etkin mi?`, obsConnected: false });
      };
    } catch (err) {
      set({ obsError: err.message, obsConnected: false });
    }
  },

  disconnectOBS: () => {
    const { _obsWs } = get();
    if (_obsWs) _obsWs.close();
    set({ obsConnected: false, _obsWs: null });
  },

  /** Trigger a scene/source in OBS when a sound plays */
  obsNotifySound: (soundName) => {
    const { _obsWs, obsConnected } = get();
    if (!obsConnected || !_obsWs) return;

    const req = {
      op: 6,
      d: {
        requestType: 'TriggerHotkeyByName',
        requestId: `sound-${Date.now()}`,
        requestData: { hotkeyName: `soundboard_${soundName.replace(/\s/g, '_')}` },
      },
    };
    try {
      _obsWs.send(JSON.stringify(req));
    } catch (_) {}
  },

  // ─── Hotkey Profiles ─────────────────────────────────────────────────────
  addProfile: (name) => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({
      hotkeyProfiles: [...state.hotkeyProfiles, { id, name, shortcuts: {} }],
    }));
  },

  deleteProfile: (id) => {
    if (id === 'default') return;
    set((state) => ({
      hotkeyProfiles: state.hotkeyProfiles.filter((p) => p.id !== id),
      activeProfileId: state.activeProfileId === id ? 'default' : state.activeProfileId,
    }));
  },

  setActiveProfile: (id) => set({ activeProfileId: id }),

  updateProfileShortcut: (profileId, soundId, shortcut) => {
    set((state) => ({
      hotkeyProfiles: state.hotkeyProfiles.map((p) =>
        p.id === profileId
          ? { ...p, shortcuts: { ...p.shortcuts, [soundId]: shortcut } }
          : p
      ),
    }));
  },

  getActiveShortcuts: () => {
    const { hotkeyProfiles, activeProfileId } = get();
    return hotkeyProfiles.find((p) => p.id === activeProfileId)?.shortcuts ?? {};
  },
}));

export default useStreamStore;
