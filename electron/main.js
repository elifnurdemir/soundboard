const { app, BrowserWindow, ipcMain, dialog, protocol, Tray, Menu, nativeImage, shell } = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const isDev = !app.isPackaged;

// Register custom protocol BEFORE app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'soundboard',
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

// ─── Single instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.exit(0); }

let mainWindow;
let tray = null;
let isQuitting = false;

// ─── Programmatic 16x16 PNG icon (lime #c4ff00) ───────────────────────────────
function makeTrayIcon() {
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crcBuf]);
  }
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(16, 0); ihdrData.writeUInt32BE(16, 4);
  ihdrData[8]=8; ihdrData[9]=2; // 8-bit RGB
  const raw = Buffer.alloc(16*(1+48));
  for (let y=0; y<16; y++) {
    raw[y*49]=0; // filter: None
    for (let x=0; x<16; x++) { const i=y*49+1+x*3; raw[i]=196; raw[i+1]=255; raw[i+2]=0; }
  }
  const png = Buffer.concat([sig, chunk('IHDR',ihdrData), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]);
  return nativeImage.createFromBuffer(png);
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('Soundboard');
  const menu = Menu.buildFromTemplate([
    { label: 'Göster / Gizle', click: () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    }},
    { type: 'separator' },
    { label: 'Çıkış Yap', click: () => { isQuitting = true; tray?.destroy(); app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.focus();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0d0b',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow file:// audio access from http://localhost in dev
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  // Custom protocol handler for serving audio files
  protocol.handle('soundboard', async (request) => {
    try {
      const { pathname } = new URL(request.url);
      let filePath = decodeURIComponent(pathname);

      // On Windows, pathname starts with /C:/... → remove leading slash
      if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(filePath)) {
        filePath = filePath.slice(1);
      }

      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mimeTypes = {
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
        flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
      };
      const mimeType = mimeTypes[ext] || 'audio/mpeg';

      const data = fs.readFileSync(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(data.length),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch (err) {
      console.error('Protocol handler error:', err);
      return new Response('File not found', { status: 404 });
    }
  });

  createWindow();
  createTray();
  uIOhook.start();
  // Check for updates 5 seconds after launch (only in packaged app)
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  }

  app.on('second-instance', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  app.on('activate', () => {
    if (mainWindow) mainWindow.show();
  });
});

// Window is hidden, not destroyed — don't quit on all-closed
app.on('window-all-closed', () => {});

// ─── Data Storage ─────────────────────────────────────────────────────────────
const getDataPath = () => path.join(app.getPath('userData'), 'soundboard-data.json');

ipcMain.handle('get-data', async () => {
  try {
    const p = getDataPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    return null;
  } catch (err) {
    console.error('Error loading data:', err);
    return null;
  }
});

ipcMain.handle('save-data', async (_, data) => {
  try {
    fs.writeFileSync(getDataPath(), JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('Error saving data:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-data-path', () => getDataPath());

// ─── File Dialog ───────────────────────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  return dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Ses Dosyaları', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
      { name: 'Tüm Dosyalar', extensions: ['*'] },
    ],
  });
});

ipcMain.handle('open-image-dialog', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  return dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Görseller', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
    ],
  });
});

ipcMain.handle('copy-image-file', async (_, srcPath) => {
  try {
    const folder = path.join(app.getPath('userData'), 'images');
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    const ext = path.extname(srcPath);
    const base = path.basename(srcPath, ext);
    let destName = path.basename(srcPath);
    let destPath = path.join(folder, destName);
    let counter = 1;
    while (fs.existsSync(destPath) && !sameFile(srcPath, destPath)) {
      destName = `${base}_${counter}${ext}`;
      destPath = path.join(folder, destName);
      counter++;
    }
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      try { fs.unlinkSync(srcPath); } catch (_) {}
    }
    return { success: true, destPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-folder-dialog', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  return dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
});

ipcMain.handle('list-audio-files', async (_, folderPath) => {
  const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']);
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(folderPath, e.name));
  } catch (err) {
    return [];
  }
});

// ─── Sounds Folder ────────────────────────────────────────────────────────────
const getSoundsFolder = () => {
  const folder = path.join(app.getPath('userData'), 'sounds');
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  return folder;
};

ipcMain.handle('get-sounds-folder', () => getSoundsFolder());

ipcMain.handle('copy-sound-file', async (_, srcPath) => {
  try {
    const folder = getSoundsFolder();
    const ext = path.extname(srcPath);
    const base = path.basename(srcPath, ext);
    let destName = path.basename(srcPath);
    let destPath = path.join(folder, destName);
    // Avoid overwriting with a different file
    let counter = 1;
    while (fs.existsSync(destPath) && !sameFile(srcPath, destPath)) {
      destName = `${base}_${counter}${ext}`;
      destPath = path.join(folder, destName);
      counter++;
    }
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      try { fs.unlinkSync(srcPath); } catch (_) {}
    }
    return { success: true, destPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function sameFile(a, b) {
  try {
    const sa = fs.statSync(a), sb = fs.statSync(b);
    return sa.size === sb.size && sa.mtimeMs === sb.mtimeMs;
  } catch { return false; }
}

ipcMain.handle('open-sounds-folder', () => {
  const folder = getSoundsFolder();
  shell.openPath(folder);
});

ipcMain.handle('app-quit', () => {
  isQuitting = true;
  tray?.destroy();
  app.quit();
});

// ─── Global Shortcuts (uiohook — non-blocking, passes keys through) ──────────
let registeredShortcuts = [];

function getUiohookKeyCode(keyName) {
  if (keyName === ' ') return UiohookKey.Space;
  if (UiohookKey[keyName] !== undefined) return UiohookKey[keyName];
  const extra = {
    arrowup: UiohookKey.ArrowUp, arrowdown: UiohookKey.ArrowDown,
    arrowleft: UiohookKey.ArrowLeft, arrowright: UiohookKey.ArrowRight,
    pageup: UiohookKey.PageUp, pagedown: UiohookKey.PageDown,
    home: UiohookKey.Home, end: UiohookKey.End,
    insert: UiohookKey.Insert, delete: UiohookKey.Delete,
    backspace: UiohookKey.Backspace, enter: UiohookKey.Enter,
    escape: UiohookKey.Escape, tab: UiohookKey.Tab,
  };
  return extra[keyName.toLowerCase()];
}

function parseShortcut(shortcut) {
  if (!shortcut) return null;
  const parts = shortcut.split('+').map((p) => p.trim());
  const modifiers = {
    ctrl:  parts.some((p) => p.toLowerCase() === 'ctrl'),
    alt:   parts.some((p) => p.toLowerCase() === 'alt'),
    shift: parts.some((p) => p.toLowerCase() === 'shift'),
  };
  const keyPart = parts.find((p) => !['ctrl','alt','shift'].includes(p.toLowerCase()));
  if (!keyPart) return null;
  const keyCode = getUiohookKeyCode(keyPart);
  if (keyCode == null) return null;
  return { modifiers, keyCode };
}

uIOhook.on('keydown', (e) => {
  for (const { soundId, modifiers, keyCode } of registeredShortcuts) {
    if (
      e.keycode === keyCode &&
      !!e.ctrlKey  === modifiers.ctrl &&
      !!e.altKey   === modifiers.alt &&
      !!e.shiftKey === modifiers.shift
    ) {
      mainWindow?.webContents.send('shortcut-triggered', soundId);
    }
  }
});

ipcMain.handle('register-shortcuts', (_, shortcuts) => {
  registeredShortcuts = shortcuts
    .map(({ soundId, shortcut }) => {
      const parsed = parseShortcut(shortcut);
      return parsed ? { soundId, ...parsed } : null;
    })
    .filter(Boolean);
});

ipcMain.handle('unregister-shortcuts', () => { registeredShortcuts = []; });

app.on('will-quit', () => uIOhook.stop());

// ─── Auto Updater ─────────────────────────────────────────────────────────────
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('update-available', info);
});

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('update-progress', progress);
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-downloaded');
});

autoUpdater.on('error', (err) => {
  console.error('AutoUpdater error:', err.message);
});

ipcMain.handle('check-for-updates', () => {
  if (app.isPackaged) autoUpdater.checkForUpdates();
});

ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
  isQuitting = true;
  autoUpdater.quitAndInstall();
});

// ─── Window Controls ──────────────────────────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);
