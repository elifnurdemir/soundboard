import { useEffect, useRef } from 'react';
import useSoundStore from './store/useSoundStore';
import useStreamStore from './store/useStreamStore';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SoundGrid from './components/SoundGrid';
import AddSoundModal from './components/AddSoundModal';
import SettingsPanel from './components/SettingsPanel';
import VoiceChatPanel from './components/VoiceChatPanel';
import StreamPanel from './components/StreamPanel';
import UpdateBanner from './components/UpdateBanner';

function matchesShortcut(event, shortcut) {
  if (!shortcut) return false;
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1].trim();
  const needsCtrl = parts.includes('ctrl');
  const needsAlt = parts.includes('alt');
  const needsShift = parts.includes('shift');
  const eventKey = event.key.toLowerCase();
  const matchKey = eventKey === key || (key === 'space' && eventKey === ' ');
  return matchKey && event.ctrlKey === needsCtrl && event.altKey === needsAlt && event.shiftKey === needsShift;
}

export default function App() {
  const {
    loadData, isLoaded, settings, sounds, playSound, stopSoundWithFade,
    stopAllInstancesOf, playingSounds,
    isAddModalOpen, isSettingsOpen, isVoiceChatOpen, isStreamOpen,
  } = useSoundStore();

  const { onChatCommand } = useStreamStore();
  const unsubRef = useRef(null);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (settings.theme === 'dark') html.classList.add('dark');
    else html.classList.remove('dark');
  }, [settings.theme]);

  // Global keyboard shortcuts — register with Electron for OS-wide hotkeys
  useEffect(() => {
    if (window.electronAPI) {
      const withShortcut = sounds.filter((s) => s.shortcut);
      window.electronAPI.registerShortcuts(
        withShortcut.map((s) => ({ soundId: s.id, shortcut: s.shortcut }))
      );
      window.electronAPI.offShortcutTriggered();
      window.electronAPI.onShortcutTriggered((soundId) => {
        const sound = useSoundStore.getState().sounds.find((s) => s.id === soundId);
        if (!sound) return;
        const isPlaying = !!(useSoundStore.getState().playingSounds[sound.id]?.length);
        if (isPlaying) stopSoundWithFade(sound.id, sound);
        else playSound(sound);
      });
      return () => window.electronAPI.unregisterShortcuts();
    }
    // Fallback for browser mode
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      for (const sound of sounds) {
        if (!sound.shortcut) continue;
        if (matchesShortcut(e, sound.shortcut)) {
          e.preventDefault();
          const isPlaying = !!(playingSounds[sound.id]?.length);
          if (isPlaying) stopSoundWithFade(sound.id, sound);
          else playSound(sound);
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sounds, playSound, stopSoundWithFade]);

  // Twitch chat command listener
  useEffect(() => {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = onChatCommand((command) => {
      const sound = sounds.find(
        (s) => s.chatCommand && s.chatCommand.toLowerCase() === command
      );
      if (sound) playSound(sound);
    });
    return () => unsubRef.current?.();
  }, [sounds, onChatCommand, playSound]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-app-bg text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <p className="text-sm font-mono tracking-widest" style={{ color: 'var(--accent)' }}>YÜKLENIYOR</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-app-bg text-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4">
          <SoundGrid />
        </main>
      </div>

      {isAddModalOpen && <AddSoundModal />}
      {isSettingsOpen && <SettingsPanel />}
      {isVoiceChatOpen && <VoiceChatPanel />}
      {isStreamOpen && <StreamPanel />}
      <UpdateBanner />
    </div>
  );
}
