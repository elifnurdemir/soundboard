import { useState, useEffect, useRef } from 'react';
import useSoundStore, { PRESET_COLORS } from '../store/useSoundStore';
import WaveformDisplay from './WaveformDisplay';

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {PRESET_COLORS.map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)}
          className={`w-7 h-7 transition-transform hover:scale-110 ${value === c ? 'scale-110 ring-2 ring-offset-1' : ''}`}
          style={{
            backgroundColor: c,
            ringColor: 'var(--accent)',
            ringOffsetColor: '#141714',
            ...(value === c ? { outline: '2px solid #c4ff00', outlineOffset: '2px' } : {}),
          }}
        />
      ))}
      <input
        type="color" value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 cursor-pointer bg-transparent p-0 overflow-hidden border border-app-border"
        title="Özel renk"
      />
    </div>
  );
}

function ShortcutInput({ value, onChange }) {
  const [recording, setRecording] = useState(false);
  const inputRef = useRef(null);

  // Use capture-phase window listener so we intercept before other handlers (e.g. modal Escape)
  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (e.key === 'Escape') {
        setRecording(false);
        return;
      }

      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      const key = e.key;
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return;
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      onChange(parts.join('+'));
      setRecording(false);
    };

    window.addEventListener('keydown', handleKeyDown, true); // capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, onChange]);

  const startRecording = () => {
    setRecording(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        readOnly
        value={recording ? '⌨ Tuşa bas...' : (value || '')}
        onBlur={() => setRecording(false)}
        onClick={startRecording}
        placeholder="Kısayol yok"
        className={`flex-1 bg-app-input px-3 py-2 text-sm text-white outline-none font-mono placeholder-[#3c4238] cursor-pointer ${
          recording
            ? 'border border-[rgba(196,255,0,0.6)] animate-pulse'
            : 'border border-app-border focus-lime'
        }`}
      />
      <button
        type="button" onClick={startRecording}
        className="px-3 py-2 bg-app-input border border-app-border hover:border-[rgba(196,255,0,0.3)] text-[#8e9c8b] hover:text-[#c4ff00] text-sm transition-colors"
        title="Kısayol Kaydet"
      >⌨</button>
      {value && (
        <button
          type="button" onClick={() => onChange('')}
          className="px-3 py-2 bg-app-input border border-app-border hover:bg-red-600/20 text-[#5c665a] hover:text-red-400 text-sm"
        >✕</button>
      )}
    </div>
  );
}

function Toggle({ value, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between p-3 bg-app-surface border border-app-border">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs font-mono mt-0.5" style={{ color: '#5c665a' }}>{description}</p>}
      </div>
      <button
        type="button" onClick={onChange}
        className="relative w-11 h-6 transition-colors"
        style={{ background: value ? 'var(--accent)' : '#1a1e1a', border: '1px solid #252b25' }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 transition-all"
          style={{ left: value ? 'calc(100% - 22px)' : '2px', background: value ? '#0b0d0b' : '#5c665a' }}
        />
      </button>
    </div>
  );
}

export default function AddSoundModal() {
  const { categories, addSound, updateSound, editingSound, closeAddModal } = useSoundStore();
  const isEditing = !!editingSound;

  const [filePath, setFilePath] = useState(editingSound?.filePath || '');
  const [fileName, setFileName] = useState(editingSound ? editingSound.filePath.split(/[\\/]/).pop() : '');
  const [name, setName] = useState(editingSound?.name || '');
  const [color, setColor] = useState(editingSound?.color || PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
  const [volume, setVolume] = useState(editingSound?.volume ?? 0.8);
  const [shortcut, setShortcut] = useState(editingSound?.shortcut || '');
  const [categoryId, setCategoryId] = useState(editingSound?.categoryId || 'default');
  const [loop, setLoop] = useState(editingSound?.loop ?? false);
  const [fadeIn, setFadeIn] = useState(editingSound?.fadeIn ?? 0);
  const [fadeOut, setFadeOut] = useState(editingSound?.fadeOut ?? 0);
  const [cooldown, setCooldown] = useState(editingSound?.cooldown ?? 0);
  const [overlap, setOverlap] = useState(editingSound?.overlap ?? true);
  const [chatCommand, setChatCommand] = useState(editingSound?.chatCommand || '');
  const [activeTab, setActiveTab] = useState('basic');

  const handleFileSelect = async () => {
    if (window.electronAPI) {
      // Electron: native dosya diyalogu
      const result = await window.electronAPI.openFileDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        const src = result.filePaths[0];
        const copyResult = await window.electronAPI.copyFile(src);
        const fp = copyResult.success ? copyResult.destPath : src;
        setFilePath(fp);
        const fn = fp.split(/[\\/]/).pop();
        setFileName(fn);
        if (!name) setName(fn.replace(/\.[^.]+$/, ''));
      }
    } else {
      // Tarayıcı: standart file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        // Tarayıcıda blob URL kullan
        const blobUrl = URL.createObjectURL(file);
        setFilePath(blobUrl);
        setFileName(file.name);
        if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
      };
      input.click();
    }
  };

  const handleFolderSelect = async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openFolderDialog();
    if (result.canceled || !result.filePaths.length) return;
    const files = await window.electronAPI.listAudioFiles(result.filePaths[0]);
    if (!files.length) return;
    const { addSound, closeAddModal } = useSoundStore.getState();
    for (const src of files) {
      const copyResult = await window.electronAPI.copyFile(src);
      const fp = copyResult.success ? copyResult.destPath : src;
      const fn = fp.split(/[\\/]/).pop();
      addSound({
        name: fn.replace(/\.[^.]+$/, ''),
        filePath: fp,
        color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
        volume: 0.8,
        categoryId: categoryId,
      });
    }
    closeAddModal();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!filePath && !isEditing) return;
    const data = { name, color, volume, shortcut, categoryId, loop, fadeIn, fadeOut, cooldown, overlap, chatCommand };
    if (filePath) data.filePath = filePath;
    if (isEditing) updateSound(editingSound.id, data);
    else addSound({ ...data, filePath });
    closeAddModal();
  };

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') closeAddModal(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const tabs = [
    { id: 'basic', label: 'TEMEL' },
    { id: 'audio', label: 'SES' },
    { id: 'stream', label: 'STREAM' },
  ];

  const labelCls = "block text-[10px] font-bold uppercase tracking-[0.1em] font-mono mb-1.5";
  const inputCls = "w-full bg-app-input border border-app-border px-3 py-2 text-sm text-white outline-none focus-lime font-mono placeholder-[#3c4238]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/60">
      <div
        className="bracket-4 bg-app-surface w-full max-w-lg mx-4 border border-app-border shadow-2xl fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] font-mono" style={{ color: 'var(--accent)' }}>
            {isEditing ? 'SESİ DÜZENLE' : 'SES EKLE'}
          </h2>
          <button onClick={closeAddModal} className="w-7 h-7 flex items-center justify-center text-[#5c665a] hover:text-white hover:bg-app-raised transition-colors text-xs">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-app-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2.5 text-[10px] font-bold font-mono tracking-wider transition-colors ${
                activeTab === t.id
                  ? 'border-b-2 text-black'
                  : 'text-[#5c665a] hover:text-[#8e9c8b] bg-app-surface'
              }`}
              style={activeTab === t.id ? { borderBottomColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(196,255,0,0.06)' } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">

            {/* ─── Basic Tab ─────────────────────────────────── */}
            {activeTab === 'basic' && (
              <>
                {/* File picker */}
                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>Ses Dosyası</label>
                  <div className="flex gap-2">
                  <button
                    type="button" onClick={handleFileSelect}
                    className="flex-1 flex items-center gap-3 px-3 py-2.5 bg-app-input border border-app-border hover:border-[rgba(196,255,0,0.3)] transition-all text-left"
                  >
                    <div className="w-8 h-8 flex items-center justify-center shrink-0" style={{ background: 'rgba(196,255,0,0.1)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#c4ff00">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      {fileName
                        ? <p className="text-white text-sm font-mono truncate">{fileName}</p>
                        : <p className="text-sm font-mono" style={{ color: '#5c665a' }}>MP3, WAV, OGG seç...</p>
                      }
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5c665a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </button>
                  {window.electronAPI && (
                    <button
                      type="button" onClick={handleFolderSelect}
                      title="Klasörden toplu ekle"
                      className="px-3 py-2.5 bg-app-input border border-app-border hover:border-[rgba(196,255,0,0.3)] text-[#5c665a] hover:text-[#c4ff00] transition-colors shrink-0"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    </button>
                  )}
                  </div>
                  {filePath && (
                    <div className="mt-2 p-2 bg-app-bg border border-app-border">
                      <WaveformDisplay filePath={filePath} color={color} height={48} bars={80}/>
                    </div>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>İsim</label>
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Ses adı..." required
                    className={inputCls}
                  />
                </div>

                {/* Color */}
                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>Renk</label>
                  <ColorPicker value={color} onChange={setColor}/>
                </div>

                {/* Category + preview */}
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className={labelCls} style={{ color: '#8e9c8b' }}>Kategori</label>
                    <select
                      value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full bg-app-input border border-app-border px-3 py-2 text-sm text-white outline-none focus-lime font-mono"
                    >
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {/* Preview button */}
                  <div
                    className="w-14 h-14 flex flex-col items-center justify-center gap-0.5 shadow-lg shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                    <span className="text-white text-[8px] font-bold truncate max-w-[52px] px-1 text-center">
                      {name || 'SES'}
                    </span>
                  </div>
                </div>

                {/* Shortcut */}
                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>Klavye Kısayolu</label>
                  <ShortcutInput value={shortcut} onChange={setShortcut}/>
                </div>
              </>
            )}

            {/* ─── Audio Tab ─────────────────────────────────── */}
            {activeTab === 'audio' && (
              <>
                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>
                    Ses Seviyesi —{' '}
                    <span className="font-mono" style={{ color: 'var(--accent)' }}>{Math.round(volume * 100)}%</span>
                  </label>
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-full volume-slider"
                  />
                </div>

                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>
                    Fade In —{' '}
                    <span className="font-mono" style={{ color: 'var(--accent)' }}>{fadeIn === 0 ? 'KAPALI' : `${fadeIn.toFixed(1)}s`}</span>
                  </label>
                  <input
                    type="range" min="0" max="5" step="0.1"
                    value={fadeIn} onChange={(e) => setFadeIn(parseFloat(e.target.value))}
                    className="w-full volume-slider"
                  />
                </div>

                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>
                    Fade Out —{' '}
                    <span className="font-mono" style={{ color: 'var(--accent)' }}>{fadeOut === 0 ? 'KAPALI' : `${fadeOut.toFixed(1)}s`}</span>
                  </label>
                  <input
                    type="range" min="0" max="5" step="0.1"
                    value={fadeOut} onChange={(e) => setFadeOut(parseFloat(e.target.value))}
                    className="w-full volume-slider"
                  />
                </div>

                <Toggle
                  value={loop}
                  onChange={() => setLoop(!loop)}
                  label="Döngü (Loop)"
                  description="Ses bitince baştan çal"
                />

                <Toggle
                  value={overlap}
                  onChange={() => setOverlap(!overlap)}
                  label="Üst Üste Çalma"
                  description="Aynı ses birden fazla kez aynı anda çalsın"
                />

                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>
                    Cooldown —{' '}
                    <span className="font-mono" style={{ color: 'var(--accent)' }}>{cooldown === 0 ? 'KAPALI' : `${cooldown}s`}</span>
                  </label>
                  <input
                    type="range" min="0" max="60" step="1"
                    value={cooldown} onChange={(e) => setCooldown(parseInt(e.target.value))}
                    className="w-full volume-slider"
                  />
                  <p className="text-[10px] font-mono mt-1" style={{ color: '#3c4238' }}>
                    Aynı sesin tekrar çalınabilmesi için bekleme süresi
                  </p>
                </div>
              </>
            )}

            {/* ─── Stream Tab ─────────────────────────────────── */}
            {activeTab === 'stream' && (
              <>
                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>Twitch Chat Komutu</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm" style={{ color: 'var(--accent)' }}>!</span>
                    <input
                      type="text"
                      value={chatCommand}
                      onChange={(e) => setChatCommand(e.target.value.toLowerCase().replace(/\s/g, ''))}
                      placeholder="komutadi (örn: selam)"
                      className={inputCls}
                    />
                  </div>
                  <p className="text-[10px] font-mono mt-1.5" style={{ color: '#3c4238' }}>
                    {chatCommand
                      ? <>İzleyiciler <code style={{ color: 'var(--accent)' }}>!{chatCommand}</code> yazınca bu ses çalınır.</>
                      : 'Boş bırakılırsa chat komutu devre dışıdır.'
                    }
                  </p>
                </div>

                <div className="p-3 bg-app-raised border border-app-border space-y-2">
                  <p className="text-[10px] font-bold font-mono uppercase tracking-wider" style={{ color: '#5c665a' }}>İpucu</p>
                  <ul className="text-xs font-mono space-y-1" style={{ color: '#5c665a' }}>
                    <li>· Cooldown ayarı spam'i engeller</li>
                    <li>· Stream panelinden Twitch'e bağlanın</li>
                    <li>· Komutlar büyük/küçük harf duyarsızdır</li>
                  </ul>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 p-5 pt-3 border-t border-app-border">
            <button
              type="button" onClick={closeAddModal}
              className="flex-1 py-2.5 bg-app-raised border border-app-border hover:border-[rgba(196,255,0,0.2)] text-[#8e9c8b] hover:text-white text-xs font-bold font-mono tracking-wider transition-colors"
            >
              İPTAL
            </button>
            <button
              type="submit"
              disabled={!isEditing && !filePath}
              className="flex-1 py-2.5 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold font-mono tracking-wider btn-accent"
            >
              {isEditing ? 'GÜNCELLE' : 'EKLE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
