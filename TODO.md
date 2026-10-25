# Yayın öncesi yapılacaklar

Durum: kod ve site hazır, ama yayınlanmadı ve bazı şeyler gerçek makinede denenmedi. Plan: önce küçük bir grupla ön sürüm (beta), sonra herkese açık sürüm ve reklam.

İşaretler: **[Sen]** senin yapman gereken (hesap, izin, gerçek makine), **[Claude]** Claude'un yapabileceği (izin verilirse), **[İkimiz]** birlikte.

## 1. Aşama: Gerçek makinede doğrulama (yayından önce şart)

Hata çıkarsa insanlar verilerini kaybedebilir, bu yüzden ilk iş bu.

- [ ] **[Sen]** Yedek al: Ayarlar → ZIP dışa aktar. Dosyayı güvenli bir yere koy.
- [ ] **[Sen]** Temiz bir Windows makinesi ya da sanal makine hazırla (kullanıcı verisi olmayan).
- [ ] **[Sen]** **Güncelleme testi:** Önce eski sürümü (`Soundboard Setup 1.0.22.exe`, `release` klasöründe) kur, birkaç ses ekle, ayar değiştir. Sonra üstüne `Padoboard Setup 1.0.23.exe` kur. Kontrol et:
  - [ ] Sesler, ayarlar, kategoriler, kısayollar yerinde mi?
  - [ ] Başlat menüsünde ve masaüstünde tek "Padoboard" kısayolu var mı, eski "Soundboard" kısayolu kalmış mı?
  - [ ] Windows Arama "padoboard" yazınca buluyor mu?
  - [ ] "Uygulamalar" listesinde tek kayıt mı?
- [ ] **[Sen]** **Temiz kurulum testi:** Hiçbir şey olmayan makinede kur. Kurulum sihirbazı açılıyor mu, sanal kablo kurulumu ve test sesi çalışıyor mu?
- [ ] **[Sen]** Bu oturumda yapılan değişiklikleri uygulama içinde uçtan uca dene:
  - [ ] 3 dakikalık videoyu sürükle, kırp, isim ver, kaydet. Ses klasöründe kısa ve isimli bir MP3 oluşuyor mu?
  - [ ] Kırpma editöründe Güçlendir (%300), bas, yankı: önizlemede duyuluyor, kaydedince dosya gerçekten yükselmiş mi?
  - [ ] Boşluk tuşu editörde çal/durdur yapıyor mu? İsim yazarken boşluk yazılıyor mu?
  - [ ] Butonlara ilk basışta gecikme yok mu? (Uygulamayı yeniden aç, hemen bas.)
  - [ ] Ses değiştirici: Telsiz ve Mağara ayarları mikrofona uygulanıyor mu?
  - [ ] Arkadaşlara giden ses, kendi duyduğunla aynı mı? Kırpılmış ses arkadaşlara da kırpılmış gidiyor mu?
- [ ] **[Sen]** Büyük kütüphane testi: 100+ ses ve birkaç uzun (10+ dk) dosya ekle. Açılış süresi ve bellek kullanımı (Görev Yöneticisi) makul mü?
- [ ] **[Sen]** **Linux testi** (Ubuntu ya da Fedora bir arkadaş): AppImage açılıyor mu, "Padoboard Mikrofon" oluşuyor mu, Discord'da seçilince arkadaşlar duyuyor mu?
- [ ] **[Sen]** İki videoyu ve siteyi baştan sona izle, takıldığın yerleri not al.

## 2. Aşama: Yayınlama (izin gerektirir)

- [ ] **[Sen]** GitHub'da depo adını `padoboard` yap (Settings → General → Repository name).
- [ ] **[Claude]** Depo adı değişince bağlantıları güncelle: `package.json` `publish.repo`, README, SECURITY, CONTRIBUTING, site, `logger.js` ("Sorun bildir" adresi), `og:image` adresi.
- [ ] **[Sen]** Settings → Actions → General → Workflow permissions: **Read and write permissions** seç.
- [ ] **[İkimiz]** Push, sonra `v1.0.23` etiketi. GitHub Actions Windows ve Linux paketlerini derleyip sürüme yükler.
- [ ] **[Sen]** Sürümü **"Pre-release" (ön sürüm)** olarak işaretle.
- [ ] **[Sen]** Settings → Pages → Branch `clean-main`, klasör `/docs`. Site birkaç dakikada açılır.
- [ ] **[Sen]** Release sayfasındaki dosya adlarını kontrol et (Windows `.exe`, Linux `.AppImage` ve `.deb`). Sitedeki indir düğmeleri bu dosyalara bağlanıyor.

## 3. Aşama: Kapalı beta (1 hafta)

- [ ] **[Sen]** 5–10 arkadaşa ön sürüm bağlantısını ver. Bir tanesi Linux, biri eski sürümden güncelleyen biri olsun.
- [ ] **[Sen]** Onlara şunu söyle: sorun olursa Ayarlar → Hakkında → Sorun bildir.
- [ ] **[Claude]** Gelen sorunları düzelt, sürüm numarasını artır.
- [ ] **[Sen]** Otomatik güncelleme çalışıyor mu? Beta sürümünden yenisine geçişi dene.

## 4. Aşama: Herkese açık çıkış

- [ ] **[Sen]** SignPath Foundation başvurusunu yap (açık kaynak, MIT, herkese açık depo, derleme Actions'ta). Onaylanınca **[Claude]** imzalamayı iş akışına ekler.
- [ ] **[Sen]** Kod imzası onayı gelene kadar sitede ve README'de SmartScreen notu kalsın.
- [ ] **[İkimiz]** Sitede yer tutucu (çizim) uygulama pencerelerini **gerçek ekran görüntüleri / kısa ekran kaydıyla** değiştir.
- [ ] **[Sen]** Beta geri bildirimi temizse sürümü "Pre-release" işaretinden çıkar (normal sürüm yap).
- [ ] **[Sen]** Videoları Instagram, TikTok ve YouTube'a yükle. Dikey olan 15 sn'lik reklam, yatay olan 40 sn'lik tanıtım. Videoların MP4'ü sayfadaki Export düğmesiyle alınır.

## Sonra (acil değil)

- [ ] **[İkimiz]** "Voicemod alternatifi" karşılaştırma sayfası. Önce Voicemod'un resmi sayfalarından plan ve fiyatı elle doğrula, sonra yaz.
- [ ] **[Claude]** Ses değiştirici kalitesi: daha fazla ayar, daha iyi efekt zinciri.
- [ ] **[Sen]** GitHub Sponsors / Buy Me a Coffee açılırsa siteye ve README'ye bağlantı.
- [ ] **[Claude]** Ölü Lemon Squeezy lisans kodunu temizle (proje sonsuza kadar ücretsiz).
- [ ] **[İkimiz]** Otomatik test: ses motoru ve kırpma/kaydetme akışı için birkaç test.
- [ ] **[Sen]** Ürün adı için marka/alan adı kontrolü (Padoboard): alan adı almak, Microsoft Store ve arama sonuçlarında çakışma var mı bakmak.
- [ ] **[Claude]** Mac desteği değerlendirmesi (şimdilik yok).

## Bilinen riskler ve notlar

- Uygulama adı değişti ama kullanıcı verisi eski `Soundboard` klasöründe kalıyor (`electron/main.js`). Bu klasör adını değiştirme.
- Linux sürümü yeni ve gerçek makinede denenmedi: sitede ve README'de "deneysel" yazıyor, öyle kalsın.
- Wayland'da global kısayol tuşları çalışmayabilir (X11 gerekir).
- Bağlantıdan ses indirme (yt-dlp) bazı sitelerin şartlarına aykırı olabilir. Arayüzde ve README'de uyarı var.
- VB-CABLE bağış temelli bir üründür: kaynağını (vb-cable.com) ve bağış notunu uygulamada göstermeye devam et.
