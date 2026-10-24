# Üçüncü taraf bileşenler

Padoboard MIT lisanslıdır (bkz. [LICENSE](LICENSE)). Aşağıdaki bileşenler kendi lisanslarıyla kullanılır.

## Uygulamaya dahil olanlar

| Bileşen | Lisans | Nerede |
|---|---|---|
| [React](https://github.com/facebook/react), [Zustand](https://github.com/pmndrs/zustand), [dnd-kit](https://github.com/clauderic/dnd-kit) | MIT | Arayüz |
| [Electron](https://github.com/electron/electron), [electron-updater](https://github.com/electron-userland/electron-builder) | MIT | Uygulama kabuğu ve güncelleme |
| [adm-zip](https://github.com/cthackers/adm-zip), [uiohook-napi](https://github.com/SnosMe/uiohook-napi), [yt-dlp-wrap-plus](https://github.com/aandrew-me/yt-dlp-wrap) | MIT | ZIP yedek, global kısayol, indirme sarmalayıcısı |
| [@breezystack/lamejs](https://github.com/shijinyu/lamejs) | **LGPL-3.0** | MP3 kodlama (aşağıya bak) |
| [uuid](https://github.com/uuidjs/uuid) | MIT | Kimlik üretimi |

Derleme araçları (Vite, Tailwind, PostCSS, electron-builder vb.) MIT lisanslıdır ve uygulamaya girmez.

### LGPL-3.0: lamejs

MP3 kodlama için `@breezystack/lamejs` kullanılır. Kütüphane kendi ayrı dosyasında (`lamejs-*.js`) derlenir ve uygulama kaynak kodu açık olduğu için, istediğin sürümüyle değiştirip uygulamayı yeniden derleyebilirsin. LGPL-3.0 metni: <https://www.gnu.org/licenses/lgpl-3.0.html>. Kütüphane kaynağı: <https://github.com/shijinyu/lamejs>.

## Windows kurulum paketine eklenen programlar

Bu dosyalar depoda **bulunmaz**; `npm install` sırasında indirilir ve yalnızca Windows kurulum paketine konur.

- **VB-CABLE** (VB-Audio Software): sanal ses kablosu. VB-CABLE, VB-Audio'nun bağışla desteklenen (donationware) bir ürünüdür; tüm katkılar memnuniyetle karşılanır. Kaynak: [vb-cable.com](https://vb-cable.com). VB-Audio'nun [lisans koşulları](https://vb-audio.com/Services/licensing.htm) gereği kullanıcıya ürünün kaynağı gösterilir ve bağış yapma imkânı hatırlatılır.
- **svcl** (NirSoft): Windows'ta uygulama başına ses yönlendirme. NirSoft freeware koşullarına uygun olarak paket bozulmadan eklenir. Kaynak: [nirsoft.net](https://www.nirsoft.net).

## Linux paketine eklenen programlar

- **yt-dlp** ([Unlicense](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE)): bağlantıdan ses indirme. Windows paketine de `yt-dlp.exe` olarak eklenir.

## Ses içerikleri

Çevrimiçi sesler [Openverse](https://openverse.org) üzerinden aranır ve yalnızca **CC0** lisanslı sonuçlar gösterilir. İndirilen her sesin kaynak ve lisans bilgisi sesle birlikte saklanır.
