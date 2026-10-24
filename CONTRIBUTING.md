# Katkı rehberi

Padoboard'a katkı vermek istediğin için teşekkürler. Küçük düzeltmeler de değerli.

## Başlamadan

- Hata ya da öneri için önce [bir konu aç](https://github.com/elifnurdemir/soundboard/issues/new). Büyük bir değişiklikse kod yazmadan önce konuşmak zaman kazandırır.
- Uygulamadaki **Ayarlar → Hakkında → Sorun bildir** butonu sürüm ve sistem bilgisini hazır doldurur.

## Geliştirme ortamı

```bash
git clone https://github.com/elifnurdemir/soundboard.git
cd soundboard
npm install      # Windows'ta VB-CABLE ve svcl, tüm sistemlerde yt-dlp indirilir
npm run dev      # Vite + Electron
```

Gereken: Node.js 20 ve npm. Linux'ta ses yönlendirmeyi denemek için PulseAudio ya da PipeWire ve `pactl` (Debian/Ubuntu: `pulseaudio-utils`).

## Proje yapısı

- `electron/`: ana süreç (pencere, güncelleme, ses yönlendirme, ortak oda, çevrimiçi sesler)
- `electron/linuxAudio.js`: Linux sanal mikrofon ve uygulama yönlendirme (`pactl`)
- `src/`: React arayüzü; `src/audio/` Web Audio motoru
- `docs/`: tanıtım sitesi (GitHub Pages), düz HTML

## Değişiklik gönderirken

- Küçük ve tek amaçlı pull request'ler tercih edilir.
- Kodun çevresindeki üslubu koru: yorumlar Türkçe, kısa ve "neden"i anlatır.
- Arayüz metinleri Türkçedir.
- `npm run build` hatasız geçmeli. Windows ve Linux'u etkileyen bir değişiklikse hangisinde denediğini yaz.
- Ses motoruna dokunuyorsan kulakla da dene: sesin kırpılmadığını, tıklama sesi çıkmadığını ve arkadaşlara giden sesin duyduğunla aynı olduğunu kontrol et.

## Lisans

Katkıların MIT lisansı ile yayınlanır ([LICENSE](LICENSE)).
