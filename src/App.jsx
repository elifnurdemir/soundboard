import { useEffect, useRef } from 'react';
import useSoundStore from './store/useSoundStore';
import useStreamStore from './store/useStreamStore';
import useLicenseStore from './store/useLicenseStore';
import useRoomStore from './store/useRoomStore';
import useCollageStore from './store/useCollageStore';
import useSetupStore from './store/useSetupStore';
import CollageStudio from './components/CollageStudio';
import SetupWizard from './components/SetupWizard';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SoundGrid from './components/SoundGrid';
import AddSoundModal from './components/AddSoundModal';
import SettingsPanel from './components/SettingsPanel';
import VoiceChatPanel from './components/VoiceChatPanel';
import StreamPanel from './components/StreamPanel';
import UpdateBanner from './components/UpdateBanner';
import SoundQueue from './components/SoundQueue';

const AUDIO_VIDEO_RE = /\.(mp3|wav|ogg|flac|m4a|aac|opus|wma|mp4|webm|mkv|mov|avi|m4v)$/i;

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
    openAddModalWithFile,
  } = useSoundStore();

  const { onChatCommand } = useStreamStore();
  const isCollageOpen = useCollageStore((s) => s.isOpen);
  const licenseStatus = useLicenseStore((s) => s.status);
  const isSetupOpen = useSetupStore((s) => s.open);
  const unsubRef = useRef(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { useLicenseStore.getState().checkStatus(); }, []);

  // İlk açılışta kurulum rehberi. Daha önce sanal kablo ayarlamış kullanıcılara gösterilmez.
  useEffect(() => {
    if (isLoaded && window.electronAPI && !settings.setupDone && !settings.voiceDeviceId) useSetupStore.getState().show();
  }, [isLoaded]);

  // Ortak oda: arkadaşların istekleri (oda main process'te çalışıyor)
  useEffect(() => {
    if (!window.electronAPI) return;
    useRoomStore.getState().refresh();
    window.electronAPI.offRoomPlay();
    window.electronAPI.onRoomPlay((p) => useRoomStore.getState().handlePlay(p));
    return () => window.electronAPI.offRoomPlay();
  }, []);

  // Premium themes only actually apply for Pro — even if a tampered-with settings file
  // claims one, we fall back to the free default rather than trusting the client state.
  useEffect(() => {
    const FREE_THEMES = new Set(['dark', 'light']);
    const requested = settings.theme || 'dark';
    const allowed = FREE_THEMES.has(requested) || licenseStatus === 'pro';
    document.documentElement.dataset.theme = allowed ? requested : 'dark';
  }, [settings.theme, licenseStatus]);

  // Global drag & drop — drop an audio/video file anywhere to open "Ses Ekle" with it preloaded.
  // Skipped while a modal is already open — its own dropzone handles that case.
  useEffect(() => {
    const handleDragOver = (e) => e.preventDefault();
    const handleDrop = (e) => {
      e.preventDefault();
      if (isAddModalOpen) return;
      const file = e.dataTransfer?.files?.[0];
      if (!file || !AUDIO_VIDEO_RE.test(file.name)) return; // görseller butonlara bırakılır
      if (window.electronAPI && file.path) openAddModalWithFile(file.path);
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [isAddModalOpen, openAddModalWithFile]);

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
      {isCollageOpen && <CollageStudio />}
      {isSetupOpen && <SetupWizard />}
      <UpdateBanner />
      <SoundQueue />
    </div>
  );
}
