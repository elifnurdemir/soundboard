@echo off
set ELECTRON_RUN_AS_NODE=
cd /d C:\Users\pc\soundboard
start /b node node_modules/.bin/vite
timeout /t 6 /nobreak > nul
start node_modules\electron\dist\electron.exe .
