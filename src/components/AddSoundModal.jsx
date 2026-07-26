import { useState, useEffect, useRef } from 'react';
import useSoundStore, { PRESET_COLORS, randomColor } from '../store/useSoundStore';
import AudioTrimEditor from './AudioTrimEditor';

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

  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (e.key === 'Escape') { setRecording(false); return; }

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

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, onChange]);

  const startRecording = () => {
    setRecording(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          readOnly
          value={recording ? '⌨ Tuşa bas...' : (value || '')}
          onBlur={() => setRecording(false)}
          onClick={startRecording}
          placeholder="Kısayol yok"
          className={`flex-1 bg-app-input px-3 py-2 text-sm text-white outline-none font-mono placeholder-[#3c4238] cursor-pointer ${
            recording ? 'border border-[rgba(196,255,0,0.6)] animate-pulse'
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
      <p className="text-[10px] font-mono" style={{ color: '#3c4238' }}>Örn: 8, F5, Ctrl+1, Alt+F9</p>
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
  const { categories, addSound, updateSound, editingSound, closeAddModal, settings } = useSoundStore();
  const isEditing = !!editingSound;

  const [filePath, setFilePath] = useState(editingSound?.filePath || '');
  const [fileName, setFileName] = useState(editingSound ? editingSound.filePath.split(/[\\/]/).pop() : '');
  const [imagePath, setImagePath] = useState(editingSound?.image || '');
  const [name, setName] = useState(editingSound?.name || '');
  const [color, setColor] = useState(editingSound?.color || randomColor(useSoundStore.getState().settings.theme));
  const [volume, setVolume] = useState(editingSound?.volume ?? 0.8);
  const [shortcut, setShortcut] = useState(editingSound?.shortcut || '');
  const [categoryId, setCategoryId] = useState(editingSound?.categoryId || 'default');
  const [loop, setLoop] = useState(editingSound?.loop ?? false);
  const [fadeIn, setFadeIn] = useState(editingSound?.fadeIn ?? 0);
  const [fadeOut, setFadeOut] = useState(editingSound?.fadeOut ?? 0);
  const [trimStart, setTrimStart] = useState(editingSound?.trimStart ?? 0);
  const [trimEnd, setTrimEnd] = useState(editingSound?.trimEnd ?? null);
  const [cooldown, setCooldown] = useState(editingSound?.cooldown ?? 0);
  const [overlap, setOverlap] = useState(editingSound?.overlap ?? true);
  const [chatCommand, setChatCommand] = useState(editingSound?.chatCommand || '');
  const [noColor, setNoColor] = useState(editingSound?.noColor ?? false);
  const [activeTab, setActiveTab] = useState('basic');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordError, setRecordError] = useState('');
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordStreamRef = useRef(null);
  const recordTimerRef = useRef(null);

  const YOUTUBE_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/i;

  const handleYoutubeDownload = async () => {
    if (!YOUTUBE_URL_RE.test(youtubeUrl.trim())) {
      setDownloadError('Geçersiz YouTube linki');
      return;
    }
    setDownloadError('');
    setDownloading(true);
    setDownloadProgress(0);
    window.electronAPI.onYoutubeProgress(setDownloadProgress);
    try {
      const res = await window.electronAPI.downloadYoutubeAudio(youtubeUrl.trim());
      if (res.success) {
        setFilePath(res.destPath);
        setFileName(res.destPath.split(/[\\/]/).pop());
        if (!name) setName(res.title);
        setTrimStart(0);
        setTrimEnd(null);
        setYoutubeUrl('');
      } else {
        setDownloadError(res.error || 'İndirme başarısız oldu');
      }
    } catch (err) {
      setDownloadError(err.message || 'İndirme başarısız oldu');
    } finally {
      window.electronAPI.offYoutubeProgress();
      setDownloading(false);
    }
  };

  const startRecording = async () => {
    setRecordError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recordTimerRef.current);

        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(recordChunksRef.current, { type: mimeType });

        if (window.electronAPI) {
          const buf = await blob.arrayBuffer();
          const res = await window.electronAPI.saveRecording(buf, ext);
          if (res.success) {
            setFilePath(res.destPath);
            setFileName(res.destPath.split(/[\\/]/).pop());
            if (!name) setName(`Kayıt ${new Date().toLocaleTimeString('tr-TR')}`);
            setTrimStart(0);
            setTrimEnd(null);
          } else {
            setRecordError(res.error || 'Kayıt kaydedilemedi');
          }
        } else {
          const blobUrl = URL.createObjectURL(blob);
          setFilePath(blobUrl);
          setFileName(`kayit.${ext}`);
          if (!name) setName(`Kayıt ${new Date().toLocaleTimeString('tr-TR')}`);
          setTrimStart(0);
          setTrimEnd(null);
        }
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      setRecordError('Mikrofona erişilemedi: ' + err.message);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  useEffect(() => () => {
    clearInterval(recordTimerRef.current);
    recordStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Reused by the file dialog, drag & drop onto the modal, and drag & drop onto the main window.
  const importFromPath = async (src) => {
    const copyResult = await window.electronAPI.copyFile(src);
    const fp = copyResult.success ? copyResult.destPath : src;
    setFilePath(fp);
    const fn = fp.split(/[\\/]/).pop();
    setFileName(fn);
    if (!name) setName(fn.replace(/\.[^.]+$/, ''));
    setTrimStart(0);
    setTrimEnd(null);
  };

  // Picked up via a global drop onto the main window (see App.jsx) before this modal opened.
  useEffect(() => {
    const pending = useSoundStore.getState().pendingImportPath;
    if (pending) {
      useSoundStore.setState({ pendingImportPath: null });
      importFromPath(pending);
    }
  }, []);

  const handleModalDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleModalDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (window.electronAPI && file.path) importFromPath(file.path);
  };

  const handleFileSelect = async () => {
    if (window.electronAPI) {
      // Electron: native dosya diyalogu
      const result = await window.electronAPI.openFileDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        await importFromPath(result.filePaths[0]);
      }
    } else {
      // Tarayıcı: standart file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,video/mp4,video/webm,.mp3,.wav,.ogg,.flac,.m4a,.aac,.mp4,.webm,.mov';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        // Tarayıcıda blob URL kullan
        const blobUrl = URL.createObjectURL(file);
        setFilePath(blobUrl);
        setFileName(file.name);
        if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
        setTrimStart(0);
        setTrimEnd(null);
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
        color: randomColor(useSoundStore.getState().settings.theme),
        volume: 0.8,
        categoryId: categoryId,
      });
    }
    closeAddModal();
  };

  const handleImageSelect = async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openImageDialog();
    if (result.canceled || !result.filePaths.length) return;
    const copyResult = await window.electronAPI.copyImageFile(result.filePaths[0]);
    setImagePath(copyResult.success ? copyResult.destPath : result.filePaths[0]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!filePath && !isEditing) return;
    const data = { name, color, volume, shortcut, categoryId, loop, fadeIn, fadeOut, trimStart, trimEnd, cooldown, overlap, chatCommand, image: imagePath || '', noColor: imagePath ? noColor : false };
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
        onDragOver={handleModalDragOver}
        onDrop={handleModalDrop}
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
                        : <p className="text-sm font-mono" style={{ color: '#5c665a' }}>MP3, WAV, MP4... seç ya da sürükle-bırak</p>
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

                  {window.electronAPI && (
                    <div className="mt-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={youtubeUrl}
                          onChange={(e) => { setYoutubeUrl(e.target.value); setDownloadError(''); }}
                          placeholder="YouTube linki yapıştır..."
                          disabled={downloading}
                          className="flex-1 bg-app-input border border-app-border px-3 py-2 text-sm text-white outline-none focus-lime font-mono placeholder-[#3c4238] disabled:opacity-50"
                        />
                        <button
                          type="button" onClick={handleYoutubeDownload}
                          disabled={downloading || !youtubeUrl.trim()}
                          className="px-3 py-2 bg-app-input border border-app-border hover:border-[rgba(196,255,0,0.3)] text-xs font-bold font-mono tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                          style={{ color: 'var(--accent)' }}
                        >
                          {downloading ? `İNDİRİLİYOR... %${Math.round(downloadProgress)}` : 'İNDİR'}
                        </button>
                      </div>
                      {downloadError && (
                        <p className="text-[10px] font-mono mt-1 text-red-400">{downloadError}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={recording ? stopRecording : startRecording}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 border text-xs font-bold font-mono tracking-wider transition-colors"
                      style={recording
                        ? { background: 'rgba(220,38,38,0.1)', borderColor: 'rgba(220,38,38,0.4)', color: '#f87171' }
                        : { background: 'var(--app-input)', borderColor: 'var(--app-border)', color: '#8e9c8b' }
                      }
                    >
                      {recording ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          DURDUR — {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
                        </>
                      ) : '🎙 MİKROFONDAN KAYDET'}
                    </button>
                    {recordError && (
                      <p className="text-[10px] font-mono mt-1 text-red-400">{recordError}</p>
                    )}
                  </div>

                  {filePath && (
                    <div className="mt-2 p-2 bg-app-bg border border-app-border">
                      <AudioTrimEditor
                        filePath={filePath}
                        trimStart={trimStart}
                        trimEnd={trimEnd}
                        color={color}
                        onChange={({ trimStart: ts, trimEnd: te }) => { setTrimStart(ts); setTrimEnd(te); }}
                      />
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

                {/* Background image */}
                <div>
                  <label className={labelCls} style={{ color: '#8e9c8b' }}>Arka Plan Görseli</label>
                  <div className="flex gap-2 items-center">
                    <button
                      type="button" onClick={handleImageSelect}
                      className="flex-1 flex items-center gap-2 px-3 py-2 bg-app-input border border-app-border hover:border-[rgba(196,255,0,0.3)] transition-all text-left"
                    >
                      {imagePath ? (
                        <img
                          src={`soundboard:///${imagePath.replace(/\\/g, '/').replace(/ /g, '%20')}`}
                          className="w-8 h-8 object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-app-raised border border-app-border">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5c665a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                        </div>
                      )}
                      <span className="text-xs font-mono" style={{ color: imagePath ? 'var(--accent)' : '#5c665a' }}>
                        {imagePath ? imagePath.split(/[\\/]/).pop() : 'Görsel seç...'}
                      </span>
                    </button>
                    {imagePath && (
                      <button
                        type="button" onClick={() => setImagePath('')}
                        className="px-2 py-2 bg-app-input border border-app-border hover:bg-red-600/20 text-[#5c665a] hover:text-red-400 transition-colors text-xs"
                      >✕</button>
                    )}
                  </div>
                </div>

                {/* No color overlay toggle — only when image is set */}
                {imagePath && (
                  <Toggle
                    value={noColor}
                    onChange={() => setNoColor(v => !v)}
                    label="Renk Kaplamasını Kaldır"
                    description="Görsel tam görünsün, renk overlay'i gizle"
                  />
                )}

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
