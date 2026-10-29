# Değişiklik günlüğü

Sürüm numaraları [package.json](package.json) ile aynıdır. Her sürümün dosyaları [Releases](https://github.com/elifnurdemir/soundboard/releases) sayfasındadır.

## 1.0.23 (hazırlanıyor)

### Yeni
- **Sesleri eşitle** (Ayarlar → Ses): tüm butonlar aynı algılanan yükseklikte çalar (ITU-R BS.1770 LUFS ölçümü). Sakin / Normal / Yüksek hedefleri. Dosyalar değişmez; sessiz sesler en çok 12 dB ve tepe sınırına kadar yükseltilir, patlamaz.
- **Ses paketleri (.padopack)**: bir kategoriyi sesleri, görselleri ve ayarlarıyla tek dosya olarak paylaş (kategori üstündeki paylaş düğmesi). Gelen paket çift tıklayarak, pencereye sürükleyerek ya da Kenar çubuğu → Paket yükle ile yeni kategori olarak eklenir. Kısayollar ve favoriler paylaşılmaz.
- **Seslendir** (yazıdan sese): yazdığını Windows'un Türkçe sesiyle (Microsoft Tolga) arkadaşlarına okut, kendin dinle ya da butona kaydet. İnternet gerekmez. Linux'ta espeak-ng ile.
- **Linux desteği** (deneysel): AppImage ve deb. Sanal mikrofon ve uygulama başına ses yönlendirme PulseAudio/PipeWire üzerinden `pactl` ile yapılır.
- **İlk kurulum sihirbazı:** sanal kablo/mikrofon, test sesi ve Discord, Steam, oyun, OBS için mikrofon seçimi.
- **Sorun bildir** butonu ve yerel hata günlüğü (Ayarlar → Hakkında). Hiçbir veri otomatik gönderilmez.
- Ses değiştirici: Telsiz ve Mağara ayarları.
- Ortak oda için yerleşik rehber.
- Sürüm iş akışı (GitHub Actions): etiketle Windows ve Linux paketleri derlenir.

### Değişti
- **Kırpma editöründe güçlendirme (%100–%500) ve ses efektleri** (bas, tiz, yankı, belirme, sönme, hız): Audacity'deki Amplify gibi, güçlendirme kaydederken dosyadaki sesin kendisini yükseltir (tepeler sınırlayıcıdan geçer, patlamaz). Önizleme canlı ve yalnızca senin hoparlöründen çıkar. Çalma ses seviyesi (butondaki ve Ses Ekle sürgüsü) %0–%100 olarak kaldı.
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
