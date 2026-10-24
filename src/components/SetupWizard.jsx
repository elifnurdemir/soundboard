import { useEffect, useMemo, useState } from 'react';
import useSetupStore from '../store/useSetupStore';
import useSoundStore from '../store/useSoundStore';
import useVoiceChatStore from '../store/useVoiceChatStore';
import { VoiceChatRouter } from '../audio/VoiceChatRouter';
import { audioEngine } from '../audio/AudioEngine';
import Pado from './Pado';

// İlk kurulum: sanal kablo → test sesi → uygulamada mikrofon seçimi → bitti.
// Mikrofon adımı, hangi uygulamada neye basılacağını küçük bir ayar penceresi çizimiyle gösterir.

const CABLE_OUT = 'CABLE Output (VB-Audio Virtual Cable)';

const APPS = [
  {
    id: 'discord', name: 'Discord',
    path: ['Kullanıcı Ayarları (dişli)', 'Ses ve Video', 'Giriş Aygıtı'],
    tip: 'Aynı sayfada "Gürültü Bastırma" ve "Otomatik Giriş Hassasiyeti" ses efektlerini kesebilir. Kapatman iyi olur.',
  },
  {
    id: 'steam', name: 'Steam',
    path: ['Steam → Ayarlar', 'Ses', 'Ses Giriş Aygıtı'],
    tip: 'Steam Uzaktan Oynat ve Steam sesli sohbeti için geçerlidir. Oyunun kendi sohbeti ayrı ayarlanır.',
  },
  {
    id: 'game', name: 'Oyunlar',
    path: ['Oyun ayarları', 'Ses / Sesli sohbet', 'Giriş (Mikrofon) aygıtı'],
    tip: 'Oyun "Varsayılan aygıt" kullanıyorsa Windows Ses ayarlarından Kayıt aygıtını CABLE Output yap.',
  },
  {
    id: 'obs', name: 'OBS / yayın',
    path: ['Ayarlar', 'Ses', 'Mic/Aux Ses'],
    tip: 'OBS\'te CABLE Output\'u "Ses Giriş Yakalama" kaynağı olarak da ekleyebilirsin.',
  },
];

// 0.9 sn'lik iki notalı bip, WAV olarak üretilir (dosya gerekmez)
function makeBeepUrl() {
  const rate = 44100;
  const notes = [{ f: 660, d: 0.22 }, { f: 880, d: 0.34 }];
  const total = Math.round(rate * notes.reduce((n, x) => n + x.d, 0));
  const pcm = new Int16Array(total);
  let i = 0;
  for (const { f, d } of notes) {
    const n = Math.round(rate * d);
    for (let k = 0; k < n; k++, i++) {
      const env = Math.min(1, k / 400) * Math.min(1, (n - k) / 2000);
      pcm[i] = Math.sin((2 * Math.PI * f * k) / rate) * 0.35 * env * 32767;
    }
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, j) => v.setUint8(o + j, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// Ayar penceresi çizimi: seçili satır (CABLE Output) vurgulanır
function MicMock({ app }) {
  return (
    <div className="border border-app-border bg-app-input p-3 space-y-2" aria-hidden="true">
      <div className="flex items-center gap-1 text-[10px] font-mono" style={{ color: '#5c665a' }}>
        {app.path.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && <span>›</span>}
            <span style={i === app.path.length - 1 ? { color: '#c9d4c6' } : undefined}>{p}</span>
          </span>
        ))}
      </div>
      <div className="border border-app-border bg-app-bg">
        <div className="px-3 py-1.5 text-[11px] font-mono" style={{ color: '#5c665a' }}>Varsayılan</div>
        <div className="px-3 py-1.5 text-[11px] font-mono" style={{ color: '#5c665a' }}>Mikrofon (Realtek Audio)</div>
        <div className="px-3 py-1.5 text-[11px] font-mono font-bold flex items-center justify-between" style={{ background: 'rgba(196,255,0,0.12)', color: '#c4ff00', outline: '1px solid rgba(196,255,0,0.5)' }}>
          <span>{CABLE_OUT}</span>
          <span>✓</span>
        </div>
      </div>
    </div>
  );
}

const STEPS = ['Merhaba', 'Sanal kablo', 'Test', 'Mikrofon', 'Bitti'];

export default function SetupWizard() {
  const hide = useSetupStore((s) => s.hide);
  const updateSettings = useSoundStore((s) => s.updateSettings);
  const { outputDevices, loadDevices, virtualDeviceId, micPassthrough, setMicPassthrough, error } = useVoiceChatStore();

  const [step, setStep] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState(null); // { ok, text }
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [appId, setAppId] = useState('discord');
  const [micBusy, setMicBusy] = useState(false);

  useEffect(() => { loadDevices(); }, []);

  const cableFound = useMemo(
    () => outputDevices.some((d) => VoiceChatRouter.isVirtualCableLabel(d.label)),
    [outputDevices],
  );
  const isWin = window.electronAPI?.platform === 'win32';

  const finish = () => { updateSettings({ setupDone: true }); hide(); };

  const refresh = async () => {
    setRefreshing(true);
    try { await loadDevices(); } finally { setRefreshing(false); }
  };

  const install = async () => {
    setInstalling(true);
    setInstallMsg(null);
    try {
      const res = await window.electronAPI.installVirtualCable();
      setInstallMsg(res.success
        ? { ok: true, text: 'Kurulum tamamlandı. Bilgisayarı yeniden başlat; sonra rehberi Ses Yönlendirme panelinden tekrar açabilirsin.' }
        : { ok: false, text: res.error || 'Kurulum başarısız oldu.' });
    } catch (err) {
      setInstallMsg({ ok: false, text: err.message || 'Kurulum başarısız oldu.' });
    } finally {
      setInstalling(false);
    }
  };

  const playTest = async () => {
    setTesting(true);
    try {
      await audioEngine.play(makeBeepUrl(), { volume: 1 });
      setTested(true);
    } catch (_) { /* ses çıkışı yoksa kullanıcı zaten duymaz */ }
    setTimeout(() => setTesting(false), 900);
  };

  const toggleMic = async () => {
    setMicBusy(true);
    try { await setMicPassthrough(!micPassthrough); } finally { setMicBusy(false); }
  };

  const app = APPS.find((a) => a.id === appId);
  const canNext = step !== 1 || cableFound;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true" aria-label="İlk kurulum">
      <div className="w-full max-w-xl max-h-full overflow-y-auto border border-app-border shadow-2xl fade-in" style={{ background: '#0d0f0d' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-app-border">
          <ol className="flex items-center gap-1.5 text-[10px] font-mono tracking-wider">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5" style={{ color: i === step ? 'var(--accent)' : i < step ? '#8e9c8b' : '#3c4238' }}>
                {i > 0 && <span style={{ color: '#3c4238' }}>—</span>}
                <span>{i + 1}</span>
                <span className="hidden sm:inline">{s.toUpperCase()}</span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={finish} className="text-[11px] font-mono text-[#5c665a] hover:text-white">Atla</button>
        </div>

        <div className="p-6 space-y-4 min-h-[340px]">
          {step === 0 && (
            <div className="flex flex-col items-center text-center gap-3">
              <Pado mood="idle" gesture="hello" size={180} />
              <h2 className="text-lg font-bold font-mono text-white">Padoboard'a hoş geldin</h2>
              <p className="text-sm font-mono max-w-md" style={{ color: '#8e9c8b' }}>
                Ben Pado. Seslerini arkadaşlarına da duyurmak için 3 küçük adım var: sanal kabloyu hazırla, test et, mikrofonunu seç. Yaklaşık 2 dakika.
              </p>
              <p className="text-[11px] font-mono max-w-md" style={{ color: '#5c665a' }}>
                Sadece kendi bilgisayarında ses çalacaksan bunları atlayabilirsin.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold font-mono text-white">Sanal kablo</h2>
              <p className="text-sm font-mono" style={{ color: '#8e9c8b' }}>
                Padoboard'un sesi, Discord'a "mikrofon gibi" gönderebilmesi için sanal bir ses kablosuna ihtiyacı var. Bu iş için VB-CABLE kullanıyoruz.
              </p>
              <div className="p-3 border flex items-center gap-3" style={cableFound ? { borderColor: 'rgba(0,255,128,0.4)', background: 'rgba(0,255,128,0.06)' } : { borderColor: '#1e231e', background: '#131713' }}>
                <span className="text-lg" style={{ color: cableFound ? '#00ff80' : '#5c665a' }} aria-hidden="true">{cableFound ? '✓' : '○'}</span>
                <div className="text-sm font-mono">
                  <div className="text-white">{cableFound ? 'Sanal kablo bulundu' : 'Sanal kablo bulunamadı'}</div>
                  <div className="text-[11px]" style={{ color: '#5c665a' }}>
                    {cableFound ? 'Hazır, devam edebilirsin.' : 'Kurmak için aşağıdaki butonu kullan.'}
                  </div>
                </div>
              </div>
              {!cableFound && (
                <div className="space-y-2">
                  {isWin && (
                    <button type="button" onClick={install} disabled={installing} className="btn-accent w-full py-2 text-xs font-bold font-mono tracking-wider disabled:opacity-50">
                      {installing ? 'KURULUYOR…' : 'OTOMATİK KUR'}
                    </button>
                  )}
                  <button type="button" onClick={refresh} disabled={refreshing} className="w-full py-2 text-xs font-bold font-mono tracking-wider bg-app-surface border border-app-border text-[#8e9c8b] hover:text-white disabled:opacity-50">
                    {refreshing ? 'ARANIYOR…' : 'CİHAZLARI YENİLE'}
                  </button>
                  {installMsg && (
                    <p className="text-[11px] font-mono" style={{ color: installMsg.ok ? '#00ff80' : '#ff6b6b' }}>{installMsg.text}</p>
                  )}
                  <p className="text-[10px] font-mono" style={{ color: '#5c665a' }}>
                    Windows kurulum sırasında yönetici izni ve bir sürücü onayı isteyecek. "Yayıncı doğrulanamadı" uyarısı çıkarsa Yine de yükle'ye bas. Kurulumdan sonra bilgisayarı yeniden başlatman gerekir.
                  </p>
                </div>
              )}
              <p className="text-[10px] font-mono pt-2 border-t border-app-border" style={{ color: '#3c4238' }}>
                VB-CABLE, VB-Audio Software'in bağışla desteklenen (donationware) ürünüdür. vb-cable.com
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold font-mono text-white">Test sesi</h2>
              <p className="text-sm font-mono" style={{ color: '#8e9c8b' }}>
                Butona bas. Bilgisayarının hoparlöründen kısa bir bip duymalısın. Aynı ses sanal kabloya da gidiyor.
              </p>
              <div className="flex flex-col items-center gap-3 py-4">
                <Pado mood={testing ? 'playing' : 'idle'} size={150} />
                <button type="button" onClick={playTest} disabled={testing} className="btn-accent px-6 py-2 text-xs font-bold font-mono tracking-wider disabled:opacity-60">
                  {testing ? 'ÇALIYOR…' : tested ? 'TEKRAR ÇAL' : 'TEST SESİ ÇAL'}
                </button>
              </div>
              {tested && (
                <p className="text-[12px] font-mono" style={{ color: '#8e9c8b' }}>
                  Duymadıysan: Windows'ta çıkış cihazının doğru olduğundan ve ses seviyesinin açık olduğundan emin ol. Sonra tekrar dene.
                </p>
              )}
              {!virtualDeviceId && cableFound && (
                <p className="text-[11px] font-mono" style={{ color: '#ff6b6b' }}>
                  Sanal kablo henüz seçilmedi. Ses Yönlendirme panelinden CABLE Input'u seçebilirsin.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold font-mono text-white">Uygulamada mikrofonu seç</h2>
              <p className="text-sm font-mono" style={{ color: '#8e9c8b' }}>
                Arkadaşlarının duyması için konuştuğun uygulamada giriş aygıtını <strong style={{ color: 'var(--accent)' }}>CABLE Output</strong> yap.
              </p>
              <div className="flex gap-1.5 flex-wrap" role="tablist">
                {APPS.map((a) => (
                  <button
                    key={a.id} type="button" role="tab" aria-selected={a.id === appId} onClick={() => setAppId(a.id)}
                    className="px-3 py-1.5 text-[11px] font-bold font-mono tracking-wider border transition-colors"
                    style={a.id === appId ? { background: 'var(--accent)', color: '#0b0d0b', borderColor: 'var(--accent)' } : { background: '#131713', color: '#8e9c8b', borderColor: '#1e231e' }}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
              <MicMock app={app} />
              <p className="text-[11px] font-mono" style={{ color: '#8e9c8b' }}>{app.tip}</p>

              <div className="flex items-center justify-between gap-3 p-3 bg-app-surface border border-app-border">
                <div>
                  <p className="text-sm font-bold text-white font-mono">Mikrofonumu da ilet</p>
                  <p className="text-[11px] font-mono" style={{ color: '#5c665a' }}>
                    Açık olmazsa Discord yalnızca Padoboard sesini duyar, seni duymaz.
                  </p>
                </div>
                <button
                  type="button" onClick={toggleMic} disabled={micBusy || !virtualDeviceId} aria-pressed={micPassthrough}
                  className="shrink-0 px-3 py-1.5 text-[11px] font-bold font-mono tracking-wider border disabled:opacity-40"
                  style={micPassthrough ? { background: 'var(--accent)', color: '#0b0d0b', borderColor: 'var(--accent)' } : { background: '#131713', color: '#8e9c8b', borderColor: '#1e231e' }}
                >
                  {micPassthrough ? 'AÇIK' : 'KAPALI'}
                </button>
              </div>
              {error && <p className="text-[11px] font-mono" style={{ color: '#ff6b6b' }}>{error}</p>}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center text-center gap-3">
              <Pado mood="celebrate" size={180} />
              <h2 className="text-lg font-bold font-mono text-white">Hazırsın!</h2>
              <p className="text-sm font-mono max-w-md" style={{ color: '#8e9c8b' }}>
                Bir butona bas, arkadaşların da duysun. Rehberi istediğin zaman <strong className="text-white">Ses Yönlendirme</strong> panelinden tekrar açabilirsin.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border">
          <button type="button" onClick={() => setStep((s) => s - 1)} disabled={step === 0} className="px-4 py-1.5 text-xs font-bold font-mono tracking-wider text-[#8e9c8b] hover:text-white disabled:opacity-0">
            GERİ
          </button>
          {step < STEPS.length - 1 ? (
            <div className="flex items-center gap-3">
              {step === 1 && !cableFound && (
                <button type="button" onClick={() => setStep(4)} className="text-[11px] font-mono text-[#5c665a] hover:text-white">Şimdilik geç</button>
              )}
              <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="btn-accent px-5 py-1.5 text-xs font-bold font-mono tracking-wider disabled:opacity-40">
                {step === 0 ? 'BAŞLA' : 'İLERİ'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={finish} className="btn-accent px-5 py-1.5 text-xs font-bold font-mono tracking-wider">BİTTİ</button>
          )}
        </div>
      </div>
    </div>
  );
}
