# Güvenlik

## Güvenlik açığı bildirme

Bir güvenlik açığı bulduysan lütfen herkese açık bir konu **açma**. Bunun yerine GitHub'da bu depodaki **Security → Report a vulnerability** (özel güvenlik bildirimi) bölümünü kullan.

Bildirimde şunları yaz: ne bulduğun, nasıl tekrar edilir, hangi sürümde gördüğün ve işletim sistemin. Bu bir hobi projesi olduğu için yanıt süresi garanti edemem, ama ciddi açıklara öncelik veririm.

## Kapsam ve tasarım notları

- Sesler, ayarlar ve kayıtlar yalnızca kullanıcının bilgisayarında tutulur. Telemetri yoktur ([gizlilik](https://elifnurdemir.github.io/soundboard/gizlilik.html)).
- **Ortak oda** açıldığında yerel bir HTTP sunucusu çalışır. Erişim rastgele üretilen bir anahtarla korunur, istekler hız sınırına tabidir ve oda kapatılınca sunucu durur. Bağlantıyı yalnızca güvendiğin kişilerle paylaş ve odayı internete açma (yönlendirme/tünel yapma).
- **Çevrimiçi sesler** yalnızca onaylı HTTPS sunucularından, içerik türü ve boyut sınırı kontrol edilerek indirilir.
- Linux AppImage'ı, bazı dağıtımlarda (ör. Ubuntu 24.04) Chromium sandbox'ı açılmayı engellediği için sandbox'sız çalışır. Uygulama yalnızca kendi yerel arayüzünü yükler. İstersen `.deb` paketini kullanabilirsin.

## Desteklenen sürümler

Yalnızca [son sürüm](https://github.com/elifnurdemir/soundboard/releases/latest) için düzeltme yayınlanır.
