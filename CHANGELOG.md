# Değişiklik günlüğü

Sürüm numaraları [package.json](package.json) ile aynıdır. Her sürümün dosyaları [Releases](https://github.com/elifnurdemir/soundboard/releases) sayfasındadır.

## 1.0.23 (hazırlanıyor)

### Yeni
- **Linux desteği** (deneysel): AppImage ve deb. Sanal mikrofon ve uygulama başına ses yönlendirme PulseAudio/PipeWire üzerinden `pactl` ile yapılır.
- **İlk kurulum sihirbazı:** sanal kablo/mikrofon, test sesi ve Discord, Steam, oyun, OBS için mikrofon seçimi.
- **Sorun bildir** butonu ve yerel hata günlüğü (Ayarlar → Hakkında). Hiçbir veri otomatik gönderilmez.
- Ses değiştirici: Telsiz ve Mağara ayarları.
- Ortak oda için yerleşik rehber.
- Sürüm iş akışı (GitHub Actions): etiketle Windows ve Linux paketleri derlenir.

### Değişti
- **Kırpma editöründe ses seviyesi %500'e kadar** ve ses efektleri (bas, tiz, yankı, belirme, sönme, hız): önizlemede canlı duyulur, Ses Ekle penceresindeki ayarlarla ortaktır. %100 üstü sesler sınırlayıcıdan geçer. Buton üzerindeki ses sürgüsü de %500'e kadar.
- **Boşluk tuşu** kırpma editöründe her zaman çal / durdur. Yazı yazarken ya da Ses Ekle penceresi açıkken global kısayollar artık ses tetiklemiyor.
- Uygulama adı **Padoboard** oldu (başlık, tepsi, kurulum dosyası). Mevcut ayarlar ve sesler korunur.
- Discord web kancasıyla hata raporlama kaldırıldı, yerine yerel günlük geldi.
- Bağlantıdan ses indirmede içerik hakkı uyarısı eklendi.

### Düzeltmeler
- Videodan çıkarılan ses ya da mikrofon kaydını kırpıp kaydedince dosya artık gerçekten kırpılıyor (3 dakikalık video, seçilen birkaç saniye olur) ve dosya, verdiğin adı alıyor (`kayit-123.mp3` yerine `Helal.mp3`).

### Proje
- MIT lisansı, README, CONTRIBUTING, SECURITY, üçüncü taraf bildirimleri.
- Tanıtım sitesi (`docs/`, GitHub Pages).

## 1.0.22 ve öncesi

Web Audio motoru, Stüdyo (çok kanallı ses editörü), Pado maskotu, çevrimiçi ses kütüphanesi (Openverse, CC0), ortak oda, ses değiştirici, otomatik güncelleme ve kırpma editörü bu sürümlerde eklendi.
