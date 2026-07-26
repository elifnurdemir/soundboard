const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Data persistence
  getData: () => ipcRenderer.invoke('get-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),

  // File system
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  copyFile: (srcPath) => ipcRenderer.invoke('copy-sound-file', srcPath),
  saveRecording: (arrayBuffer, ext) => ipcRenderer.invoke('save-recording', arrayBuffer, ext),
  getSoundsFolder: () => ipcRenderer.invoke('get-sounds-folder'),
  openSoundsFolder: () => ipcRenderer.invoke('open-sounds-folder'),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  copyImageFile: (srcPath) => ipcRenderer.invoke('copy-image-file', srcPath),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  listAudioFiles: (folderPath) => ipcRenderer.invoke('list-audio-files', folderPath),
  quitApp: () => ipcRenderer.invoke('app-quit'),
  registerShortcuts: (shortcuts) => ipcRenderer.invoke('register-shortcuts', shortcuts),
  unregisterShortcuts: () => ipcRenderer.invoke('unregister-shortcuts'),
  onShortcutTriggered: (cb) => ipcRenderer.on('shortcut-triggered', (_, soundId) => cb(soundId)),
  offShortcutTriggered: () => ipcRenderer.removeAllListeners('shortcut-triggered'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_, p) => cb(p)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  deactivateLicense: () => ipcRenderer.invoke('deactivate-license'),
  openCheckout: () => ipcRenderer.invoke('open-checkout'),
  downloadYoutubeAudio: (url) => ipcRenderer.invoke('download-youtube-audio', url),
  onYoutubeProgress: (cb) => ipcRenderer.on('youtube-download-progress', (_, pct) => cb(pct)),
  offYoutubeProgress: () => ipcRenderer.removeAllListeners('youtube-download-progress'),
  installVirtualCable: () => ipcRenderer.invoke('install-virtual-cable'),
  listAudioSessions: () => ipcRenderer.invoke('list-audio-sessions'),
  routeAppToCable: (exeName) => ipcRenderer.invoke('route-app-to-cable', exeName),
  restoreAppDevice: (exeName, deviceId) => ipcRenderer.invoke('restore-app-device', exeName, deviceId),
  resetAllAppRouting: () => ipcRenderer.invoke('reset-all-app-routing'),
  syncRoutedApps: (snapshot) => ipcRenderer.invoke('sync-routed-apps', snapshot),
  exportZip: (data) => ipcRenderer.invoke('export-zip', data),
  importZip: () => ipcRenderer.invoke('import-zip'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
});
