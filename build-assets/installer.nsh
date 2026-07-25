!macro customInstall
  ; Auto-update reinstalls run this silently (/S) in the background — never
  ; prompt then, only on a manual/interactive install or reinstall.
  IfSilent vbcable_skip
  MessageBox MB_YESNO "Discord/OBS gibi programlara ses göndermek için sanal ses kablosu (VB-CABLE, VB-Audio'nun donationware ürünü — vb-cable.com) de kurulsun mu?$\r$\n$\r$\nBir Windows güvenlik onayı çıkacak, ardından bilgisayarını yeniden başlatman gerekecek." IDYES vbcable_install IDNO vbcable_skip
  vbcable_install:
    ExecShell "runas" "$INSTDIR\resources\bin\vbcable\VBCABLE_Setup_x64.exe" "-i -h"
  vbcable_skip:
!macroend
