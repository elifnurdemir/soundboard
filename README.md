# Padoboard

Windows ve Linux için ücretsiz, açık kaynaklı soundboard. Sesleri butonlara koy, oyunda ve Discord'da arkadaşlarına çal, kendi sesini değiştir, kayıt al ve düzenle.

*A free, open-source soundboard for Windows and Linux: play sounds into games and voice chat, change your voice, record and edit audio.*

Maskotumuz **Pado** :)

## Özellikler

- Sesleri buton olarak dizme, ızgara 1–20 sütun, görsel/GIF ekleme, sürükle-bırak
- Ses dosyası veya videodan ses alma (MP3'e çevirir)
- Kırpma editörü (dalga formu, yakınlaştırma), ses seviyesi, bas/tiz, yankı
- Arkadaşlara ses gönderme (sanal kablo ile Discord, Steam ve oyunlara mikrofon olarak)
- Mikrofon ses değiştirici (Sincap, Kalın, Robot, Yankı, Canavar, Uzaylı)
- **Stüdyo**: çok kanallı ses editörü, kayıt alma, birleştirme, MP3 dışa aktarma
- **Çevrimiçi sesler**: Openverse'ten CC0 lisanslı ses efektleri; önizleme indirmeden dinlenir
- Ortak oda: arkadaşların tarayıcıdan sana ses çaldırabilir (aynı ağ)
- Otomatik güncelleme

## Kurulum

[Releases](https://github.com/elifnurdemir/soundboard/releases) sayfasından son kurulum dosyasını indir.

### Windows

Windows "Bilinmeyen yayıncı" uyarısı gösterebilir. Uygulama henüz kod imzalı değil, **Daha fazla bilgi → Yine de çalıştır** ile devam edebilirsin. Kaynak kod bu depoda, istersen kendin derleyebilirsin.

### Linux (deneysel)

[Releases](https://github.com/elifnurdemir/soundboard/releases) sayfasından **AppImage** (çalıştırılabilir yap ve aç) ya da **.deb** dosyasını indir.

- Ses yönlendirme için **PulseAudio** ya da **PipeWire** (pipewire-pulse) ve `pactl` komutu gerekir (Debian/Ubuntu: `pulseaudio-utils`).
- İlk kurulum sihirbazı **Padoboard Mikrofon** adında sanal bir mikrofon oluşturur. Sürücü, yönetici izni ya da yeniden başlatma gerekmez. Discord, Steam ya da oyunda giriş aygıtı olarak bunu seç.
- Uygulama başına ses yönlendirme de `pactl` ile yapılır (Ses Yönlendirme paneli).
- **Wayland** oturumlarında global kısayol tuşları çalışmayabilir (X11 gerekir). Uygulama içindeki kısayollar çalışır.
- Linux desteği yeni ve henüz geniş çapta test edilmedi. Sorun görürsen Ayarlar → Hakkında → Sorun bildir ile haber ver.

## Sorun bildirme

Uygulamada **Ayarlar → Hakkında → Sorun bildir** butonu, GitHub'da sürüm ve sistem bilgisi hazır doldurulmuş bir sorun formu açar. Hata günlüğü yalnızca bilgisayarında tutulur, hiçbir yere otomatik gönderilmez.

## Gizlilik

- Sesler, ayarlar ve kayıtlar bilgisayarında kalır. Telemetri ve takip yok.
- Çevrimiçi sesler aranırken arama kelimen ve IP adresin Openverse'e gider.
- Güncelleme kontrolü GitHub'a bağlanır.
- Ortak oda açıkken bilgisayarında yerel bir sunucu çalışır; erişim rastgele bir anahtarla korunur.

## Geliştirme

```bash
npm install
npm run dev        # geliştirme modu
npm run dist       # Windows kurulum dosyası
npm run dist:linux # Linux (Linux üzerinde derlenmeli: AppImage ve deb)
```

Electron + React + Vite + Zustand + Tailwind. Ses motoru tek bir Web Audio grafiği üzerinde çalışır.

## Üçüncü taraf bileşenler

- [VB-CABLE](https://vb-audio.com/Cable/) (VB-Audio, bağışla desteklenen yazılım): Windows'ta sanal ses kablosu
- PulseAudio / PipeWire (`pactl`): Linux'ta sanal mikrofon ve uygulama yönlendirme
- [yt-dlp](https://github.com/yt-dlp/yt-dlp): bağlantıdan ses indirme
- [Openverse](https://openverse.org): CC0 ses kütüphanesi
- [lamejs](https://github.com/zhuker/lamejs): MP3 kodlama

## Destek

Proje ücretsizdir. Beğendiysen depoya yıldız vermen yeter.

## Lisans

[MIT](LICENSE)
