import { useEffect, useState } from 'react';
import useVoiceChatStore from '../store/useVoiceChatStore';
import useSoundStore from '../store/useSoundStore';
import { VoiceChatRouter } from '../audio/VoiceChatRouter';

export default function VoiceChatPanel() {
  const { closeVoiceChat } = useSoundStore();
  const {
    enabled, setEnabled,
    virtualDeviceId, setVirtualDevice,
    micPassthrough, setMicPassthrough,
    outputDevices, loadDevices,
    routedApps, routeApp, unrouteApp,
    error,
  } = useVoiceChatStore();

  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [audioApps, setAudioApps] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [routingExe, setRoutingExe] = useState(null);

  useEffect(() => {
    loadDevices();
    // Restore saved device into store state
    const savedId = useSoundStore.getState().settings.voiceDeviceId;
    if (savedId && !virtualDeviceId) {
      setVirtualDevice(savedId);
    }
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') closeVoiceChat(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const handleToggleMic = async () => {
    setLoading(true);
    try {
      await setMicPassthrough(!micPassthrough);
    } finally {
      setLoading(false);
    }
  };

  const virtualCables = outputDevices.filter((d) => VoiceChatRouter.isVirtualCableLabel(d.label));
  const otherDevices = outputDevices.filter((d) => !virtualCables.includes(d));

  const handleScanApps = async () => {
    setScanning(true);
    try {
      const res = await window.electronAPI.listAudioSessions();
      setAudioApps(res.success ? res.apps : []);
    } finally {
      setScanning(false);
    }
  };

  const handleToggleRoute = async (exe) => {
    setRoutingExe(exe);
    try {
      if (routedApps[exe]) await unrouteApp(exe);
      else await routeApp(exe);
    } finally {
      setRoutingExe(null);
    }
  };

  const handleInstallVirtualCable = async () => {
    setInstalling(true);
    setInstallMessage('');
    try {
      const res = await window.electronAPI.installVirtualCable();
      if (res.success) {
        setInstallMessage('Kurulum tamamlandı. Bilgisayarını yeniden başlat, sonra buraya dönüp "Cihazları Yenile"ye bas.');
      } else {
        setInstallMessage(res.error || 'Kurulum başarısız oldu.');
      }
    } catch (err) {
      setInstallMessage(err.message || 'Kurulum başarısız oldu.');
    } finally {
      setInstalling(false);
    }
  };

  const Toggle = ({ value, onChange, disabled }) => (
    <button
      onClick={onChange}
      disabled={disabled}
      className="relative w-11 h-6 transition-colors disabled:opacity-40"
      style={{ background: value ? 'var(--accent)' : '#1a1e1a', border: '1px solid #1e231e' }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 transition-all"
        style={{
          left: value ? 'calc(100% - 22px)' : '2px',
          background: value ? '#0b0d0b' : '#5c665a',
        }}
      />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 modal-backdrop bg-black/50" onClick={closeVoiceChat}/>
      <div className="w-96 border-l border-app-border flex flex-col h-full shadow-2xl fade-in overflow-hidden" style={{ background: '#0d0f0d' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] font-mono" style={{ color: 'var(--accent)' }}>SES YÖNLENDİRME</h2>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: '#5c665a' }}>Discord · OBS · Zoom · her yerde çalışır</p>
          </div>
          <button onClick={closeVoiceChat} className="w-7 h-7 flex items-center justify-center text-[#5c665a] hover:text-white hover:bg-app-surface transition-colors text-xs">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* How it works */}
          <div className="bracket-4 p-4 bg-app-surface space-y-3">
            <div className="flex items-center gap-2">
              <span className="tag-accent text-[9px]">KURULUM</span>
            </div>
            <ol className="text-xs font-mono space-y-2" style={{ color: '#8e9c8b' }}>
              <li className="flex gap-2">
                <span style={{ color: 'var(--accent)' }}>01</span>
                <span><strong className="text-white">VB-Audio Cable</strong> indirin — vb-audio.com (ücretsiz)</span>
              </li>
              <li className="flex gap-2">
                <span style={{ color: 'var(--accent)' }}>02</span>
                <span>Bilgisayarı yeniden başlatın</span>
              </li>
              <li className="flex gap-2">
                <span style={{ color: 'var(--accent)' }}>03</span>
                <span>Aşağıdan <strong className="text-white">CABLE Input</strong> seçin</span>
              </li>
              <li className="flex gap-2">
                <span style={{ color: 'var(--accent)' }}>04</span>
                <span>Uygulamada mikrofon olarak <strong className="text-white">CABLE Output</strong> seçin</span>
              </li>
            </ol>
            <p className="text-[10px] font-mono pt-2 border-t border-app-border" style={{ color: '#3c4238' }}>
              ✓ Discord · OBS · Zoom · Teams · ses kayıt yazılımları
            </p>

            {window.electronAPI && (
              <div className="pt-2 border-t border-app-border space-y-2">
                <button
                  onClick={handleInstallVirtualCable}
                  disabled={installing}
                  className="w-full py-2 text-[10px] font-bold font-mono tracking-wider bg-app-input border border-app-border hover:border-[rgba(196,255,0,0.3)] disabled:opacity-50 transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  {installing ? 'KURULUYOR...' : '⚡ OTOMATİK KUR'}
                </button>
                <p className="text-[9px] font-mono" style={{ color: '#3c4238' }}>
                  VB-CABLE, VB-Audio'nun donationware ürünüdür — vb-cable.com. Kurulum sırasında bir Windows güvenlik onayı çıkacak.
                </p>
                {installMessage && (
                  <p className="text-[10px] font-mono" style={{ color: installMessage.startsWith('Kurulum tamamlandı') ? '#00ff80' : '#ff6b6b' }}>
                    {installMessage}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between p-3 bg-app-surface border border-app-border">
            <div>
              <p className="text-sm font-bold text-white">Dual Output</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: '#5c665a' }}>Hoparlör + sanal kablo aynı anda</p>
            </div>
            <Toggle value={enabled} onChange={() => setEnabled(!enabled)} />
          </div>

          {/* Device picker */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.1em] font-mono mb-2" style={{ color: '#8e9c8b' }}>
              Sanal Ses Cihazı
            </label>
            {outputDevices.length === 0 ? (
              <p className="text-xs font-mono italic" style={{ color: '#5c665a' }}>Cihaz bulunamadı. Mikrofon erişimine izin verin.</p>
            ) : (
              <select
                value={virtualDeviceId || ''}
                onChange={(e) => setVirtualDevice(e.target.value || null)}
                className="w-full bg-app-input border border-app-border px-3 py-2 text-sm text-white outline-none focus-lime font-mono"
              >
                <option value="">-- Cihaz Seçin --</option>
                {virtualCables.length > 0 && (
                  <optgroup label="⚡ Sanal Kablo (Önerilen)">
                    {virtualCables.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </optgroup>
                )}
                {otherDevices.length > 0 && (
                  <optgroup label="Diğer Cihazlar">
                    {otherDevices.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
            <button
              onClick={loadDevices}
              className="mt-2 text-[10px] font-mono transition-colors hover:text-white"
              style={{ color: '#5c665a' }}
            >
              ↺ CİHAZLARI YENİLE
            </button>
          </div>

          {/* Per-app output routing (Chrome/Spotify → CABLE) */}
          {window.electronAPI && (
            <div className="p-3 bg-app-surface border border-app-border space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-white">Uygulama Sesini Yönlendir</p>
                <button
                  onClick={handleScanApps}
                  disabled={scanning}
                  className="text-[10px] font-bold font-mono tracking-wider disabled:opacity-50 transition-colors hover:text-white"
                  style={{ color: 'var(--accent)' }}
                >
                  {scanning ? '...' : '🔍 BUL'}
                </button>
              </div>
              <p className="text-xs font-mono" style={{ color: '#5c665a' }}>
                Chrome (YouTube) veya Spotify gibi uygulamaların çıkışını doğrudan sanal kabloya yönlendirir.
              </p>

              {audioApps && (
                audioApps.length === 0 ? (
                  <p className="text-xs font-mono italic" style={{ color: '#5c665a' }}>Ses çalan bir uygulama bulunamadı.</p>
                ) : (
                  <div className="space-y-1.5">
                    {audioApps.map((a) => {
                      const routed = !!routedApps[a.exe];
                      const busy = routingExe === a.exe;
                      const buttonLabel = busy ? '...' : (routed ? 'GERİ AL' : "CABLE'A YÖNLENDİR");
                      return (
                        <div key={a.exe} className="flex items-center justify-between gap-2 p-2 bg-app-input border border-app-border">
                          <span className="text-xs font-mono text-white truncate">{a.name}</span>
                          <button
                            onClick={() => handleToggleRoute(a.exe)}
                            disabled={busy}
                            className="shrink-0 px-2 py-1 text-[10px] font-bold font-mono tracking-wider border disabled:opacity-50 transition-colors"
                            style={routed
                              ? { borderColor: 'rgba(220,38,38,0.4)', color: '#f87171', background: 'rgba(220,38,38,0.08)' }
                              : { borderColor: 'var(--accent-border)', color: 'var(--accent)', background: 'var(--accent-dim)' }
                            }
                          >
                            {buttonLabel}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              <p className="text-[9px] font-mono pt-2 border-t border-app-border" style={{ color: '#3c4238' }}>
                Discord/Teams/Zoom/Skype/Slack burada görünmez — sesin geri yankılanmasını önlemek için. Ses yönlendirme svcl (NirSoft.net) ile yapılır.
              </p>
            </div>
          )}

          {/* Mic passthrough */}
          <div className="flex items-center justify-between p-3 bg-app-surface border border-app-border">
            <div>
              <p className="text-sm font-bold text-white">Mikrofon Geçişi</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: '#5c665a' }}>Kendi sesinizi de sanal kabloya yönlendir</p>
            </div>
            <Toggle
              value={micPassthrough}
              onChange={handleToggleMic}
              disabled={loading || !virtualDeviceId}
            />
          </div>

          {micPassthrough && (
            <div className="flex items-center gap-2 p-3 border" style={{ background: 'rgba(0,255,128,0.05)', borderColor: 'rgba(0,255,128,0.2)' }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75"/>
                <span className="relative rounded-full h-2 w-2 bg-green-400"/>
              </span>
              <p className="text-xs font-mono text-green-400">MİKROFON AKTİF — sanal kabloya iletiliyor</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 border" style={{ background: 'rgba(255,50,50,0.08)', borderColor: 'rgba(255,50,50,0.25)' }}>
              <p className="text-xs font-mono text-red-400">{error}</p>
            </div>
          )}

          {/* Status */}
          {enabled && virtualDeviceId && (
            <div className="p-3 bg-app-surface border border-app-border space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] font-mono" style={{ color: '#5c665a' }}>DURUM</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5" style={{ background: enabled ? 'var(--accent)' : '#3c4238' }}/>
                <p className="text-xs font-mono" style={{ color: '#8e9c8b' }}>Dual output {enabled ? 'aktif' : 'pasif'}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: micPassthrough ? '#00ff80' : '#3c4238' }}/>
                <p className="text-xs font-mono" style={{ color: '#8e9c8b' }}>Mikrofon {micPassthrough ? 'aktif' : 'pasif'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
