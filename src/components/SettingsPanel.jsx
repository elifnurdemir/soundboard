import { useState, useEffect } from "react";
import useSoundStore from "../store/useSoundStore";

function UpdateChecker() {
  const [status, setStatus] = useState('idle'); // idle | checking | latest | available | downloading | ready
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    window.electronAPI.onUpdateAvailable((info) => { setVersion(info.version); setStatus('available'); });
    window.electronAPI.onUpdateProgress((p) => { setProgress(Math.round(p.percent)); setStatus('downloading'); });
    window.electronAPI.onUpdateDownloaded(() => setStatus('ready'));
  }, []);

  const check = () => {
    setStatus('checking');
    window.electronAPI.checkForUpdates();
    setTimeout(() => setStatus(s => s === 'checking' ? 'latest' : s), 5000);
  };

  return (
    <div className="p-3 bg-app-surface border border-app-border space-y-2">
      {status === 'idle' || status === 'latest' || status === 'checking' ? (
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono text-[#8e9c8b]">
            {status === 'checking' ? 'Kontrol ediliyor...' : status === 'latest' ? 'Güncel sürümdesiniz' : 'Güncelleme kontrolü'}
          </p>
          <button
            onClick={check}
            disabled={status === 'checking'}
            className="px-3 py-1.5 text-xs font-bold font-mono bg-app-raised border border-app-border hover:border-[rgba(196,255,0,0.3)] text-[#8e9c8b] hover:text-[#c4ff00] transition-colors disabled:opacity-40"
          >
            {status === 'checking' ? '...' : 'KONTROL ET'}
          </button>
        </div>
      ) : status === 'available' ? (
        <div className="space-y-2">
          <p className="text-xs font-mono text-white">v{version} mevcut</p>
          <button onClick={() => { window.electronAPI.downloadUpdate(); setStatus('downloading'); }} className="w-full py-1.5 text-xs font-bold font-mono btn-accent">
            İNDİR
          </button>
        </div>
      ) : status === 'downloading' ? (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono text-[#8e9c8b]">
            <span>İndiriliyor...</span><span style={{ color: 'var(--accent)' }}>{progress}%</span>
          </div>
          <div className="w-full h-1 bg-app-raised rounded-full overflow-hidden">
            <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-mono text-[#8e9c8b]">Güncelleme hazır</p>
          <button onClick={() => window.electronAPI.installUpdate()} className="w-full py-1.5 text-xs font-bold font-mono btn-accent">
            YENİDEN BAŞLAT VE KUR
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.12em] font-mono"
        style={{ color: "var(--accent)" }}
      >
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-app-surface border border-app-border">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && (
          <p className="text-xs font-mono mt-0.5" style={{ color: "#5c665a" }}>
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPanel() {
  const { settings, updateSettings, closeSettings, sounds, categories } =
    useSoundStore();
  const [dataPath, setDataPath] = useState("");
  const [soundsFolder, setSoundsFolder] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [exportState, setExportState] = useState('idle'); // idle | working | done | error
  const [importState, setImportState] = useState('idle');

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getDataPath().then(setDataPath);
      window.electronAPI.getSoundsFolder().then(setSoundsFolder);
      window.electronAPI.getAppVersion().then(setAppVersion);
    } else {
      setDataPath("localStorage (tarayıcı modu)");
    }
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const handleExport = async () => {
    if (!window.electronAPI) return;
    setExportState('working');
    const state = useSoundStore.getState();
    const result = await window.electronAPI.exportZip({
      categories: state.categories,
      sounds: state.sounds,
      settings: state.settings,
    });
    if (result.canceled) { setExportState('idle'); return; }
    setExportState(result.success ? 'done' : 'error');
    setTimeout(() => setExportState('idle'), 2500);
  };

  const handleImport = async () => {
    if (!window.electronAPI) return;
    setImportState('working');
    const result = await window.electronAPI.importZip();
    if (result.canceled) { setImportState('idle'); return; }
    if (!result.success) {
      setImportState('error');
      setTimeout(() => setImportState('idle'), 2500);
      return;
    }
    const { data } = result;
    const state = useSoundStore.getState();
    // Merge: add imported categories that don't exist yet
    const existingCatIds = new Set(state.categories.map(c => c.id));
    const newCats = data.categories.filter(c => !existingCatIds.has(c.id));
    // Merge sounds
    const existingSoundIds = new Set(state.sounds.map(s => s.id));
    const newSounds = data.sounds.filter(s => !existingSoundIds.has(s.id));
    useSoundStore.setState({
      categories: [...state.categories, ...newCats],
      sounds: [...state.sounds, ...newSounds],
    });
    useSoundStore.getState().saveData();
    setImportState('done');
    setTimeout(() => setImportState('idle'), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 modal-backdrop bg-black/50"
        onClick={closeSettings}
      />
      <div className="w-80 border-l border-app-border flex flex-col h-full shadow-2xl fade-in overflow-hidden bg-app-bg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <h2
            className="text-xs font-bold uppercase tracking-[0.12em] font-mono"
            style={{ color: "var(--accent)" }}
          >
            AYARLAR
          </h2>
          <button
            onClick={closeSettings}
            className="w-7 h-7 flex items-center justify-center text-[#5c665a] hover:text-white hover:bg-app-surface transition-colors text-xs"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Görünüm */}
          <Section title="Görünüm">
            <Row label="Tema" description="Açık veya koyu tema">
              <div className="flex overflow-hidden border border-app-border">
                {["dark", "light"].map((t) => (
                  <button
                    key={t}
                    onClick={() => updateSettings({ theme: t })}
                    className={`px-3 py-1.5 text-xs font-bold font-mono transition-colors ${
                      settings.theme === t
                        ? "text-black"
                        : "bg-app-surface text-[#5c665a] hover:text-white"
                    }`}
                    style={
                      settings.theme === t
                        ? { background: "var(--accent)" }
                        : {}
                    }
                  >
                    {t === "dark" ? "KOYU" : "AÇIK"}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="Izgara Sütunları" description="Grid'deki sütun sayısı">
              <select
                value={settings.gridColumns || 5}
                onChange={(e) =>
                  updateSettings({ gridColumns: parseInt(e.target.value) })
                }
                className="bg-app-input border border-app-border px-2 py-1.5 text-sm text-white outline-none focus-lime font-mono"
                style={{ color: "var(--accent)" }}
              >
                {[3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 28, 32].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Row>
          </Section>

          {/* Ses */}
          <Section title="Ses">
            <Row
              label="Global Ses"
              description={`${Math.round((settings.globalVolume ?? 1) * 100)}%`}
            >
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.globalVolume ?? 1}
                onChange={(e) =>
                  updateSettings({ globalVolume: parseFloat(e.target.value) })
                }
                className="w-28 volume-slider"
              />
            </Row>
          </Section>

          {/* Veri */}
          <Section title="Veri">
            <div className="p-3 bg-app-surface border border-app-border space-y-1">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#5c665a]">
                Veri Konumu
              </p>
              <p className="text-[10px] text-[#3c4238] break-all font-mono leading-relaxed">
                {dataPath || "Yükleniyor..."}
              </p>
            </div>

            {soundsFolder && (
              <div className="p-3 bg-app-surface border border-app-border space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[#5c665a]">
                  Ses Dosyaları Klasörü
                </p>
                <p className="text-[10px] text-[#3c4238] break-all font-mono leading-relaxed">
                  {soundsFolder}
                </p>
                {window.electronAPI && (
                  <button
                    onClick={() => window.electronAPI.openSoundsFolder()}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-app-raised border border-app-border hover:border-[rgba(196,255,0,0.3)] text-[#8e9c8b] hover:text-[#c4ff00] text-xs font-bold font-mono tracking-wider transition-colors"
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    KLASÖRÜ AÇ
                  </button>
                )}
              </div>
            )}

            <div className="p-3 bg-app-surface border border-app-border flex items-center justify-between">
              <p className="text-xs font-mono text-[#8e9c8b]">İstatistikler</p>
              <p
                className="text-xs font-mono"
                style={{ color: "var(--accent)" }}
              >
                {sounds.length} SES · {categories.length} KAT
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleExport}
                disabled={exportState === 'working'}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border text-xs font-bold font-mono tracking-wider transition-colors disabled:opacity-50"
                style={exportState === 'done'
                  ? { background: 'rgba(196,255,0,0.1)', borderColor: 'rgba(196,255,0,0.4)', color: 'var(--accent)' }
                  : exportState === 'error'
                  ? { background: 'rgba(220,38,38,0.1)', borderColor: 'rgba(220,38,38,0.4)', color: '#f87171' }
                  : { background: 'var(--app-surface)', borderColor: 'var(--app-border)', color: '#8e9c8b' }
                }
              >
                {exportState === 'working' ? '...' : exportState === 'done' ? '✓ KAYDEDİLDİ' : exportState === 'error' ? '✗ HATA' : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    EXPORT
                  </>
                )}
              </button>
              <button
                onClick={handleImport}
                disabled={importState === 'working'}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border text-xs font-bold font-mono tracking-wider transition-colors disabled:opacity-50"
                style={importState === 'done'
                  ? { background: 'rgba(196,255,0,0.1)', borderColor: 'rgba(196,255,0,0.4)', color: 'var(--accent)' }
                  : importState === 'error'
                  ? { background: 'rgba(220,38,38,0.1)', borderColor: 'rgba(220,38,38,0.4)', color: '#f87171' }
                  : { background: 'var(--app-surface)', borderColor: 'var(--app-border)', color: '#8e9c8b' }
                }
              >
                {importState === 'working' ? '...' : importState === 'done' ? '✓ İÇE AKTARILDI' : importState === 'error' ? '✗ HATA' : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    IMPORT
                  </>
                )}
              </button>
            </div>
          </Section>

          {/* Güncelleme */}
          {window.electronAPI && (
            <Section title="Güncelleme">
              <UpdateChecker />
            </Section>
          )}

          {/* Hakkında */}
          <Section title="Hakkında">
            <div className="bracket-4 p-4 bg-app-surface text-center space-y-2">
              <div
                className="w-10 h-10 flex items-center justify-center mx-auto"
                style={{ background: "var(--accent)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#0b0d0b">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
              <p className="text-sm font-bold font-mono tracking-widest text-white">
                SOUNDBOARD
              </p>
              <p className="text-[10px] font-mono text-[#5c665a]">
                {appVersion ? `v${appVersion}` : 'v—'} · ELECTRON + REACT
              </p>
              <p className="text-[10px] font-mono text-[#3c4238]">
                VB-AUDIO · OBS · TWITCH
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
