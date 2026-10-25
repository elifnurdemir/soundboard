@echo off
title Soundboard - Build EXE
cd /d "%~dp0"
echo =========================================
echo  Soundboard - EXE Olusturuluyor...
echo =========================================
echo.
echo [1/2] Arayuz derleniyor (Vite build)...
call npx vite build
if %errorlevel% neq 0 (
  echo HATA: Vite build basarisiz!
  pause
  exit /b 1
)
echo.
echo [2/2] Electron paketi olusturuluyor...
call npx electron-builder --win --x64
if %errorlevel% neq 0 (
  echo HATA: electron-builder basarisiz!
  pause
  exit /b 1
)
echo.
echo =========================================
echo  TAMAMLANDI! EXE dosyasi: release\
echo =========================================
explorer release
pause
