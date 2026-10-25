/**
 * Electron launcher — clears ELECTRON_RUN_AS_NODE before spawning Electron.
 * This env var makes Electron behave like Node.js, breaking the app.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const appPath = path.join(__dirname, '..');

if (!fs.existsSync(electronPath)) {
  // Fallback: use the electron binary from PATH
  console.error('electron.exe not found at', electronPath);
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const proc = spawn(electronPath, [appPath, ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  detached: false,
});

proc.on('exit', (code) => process.exit(code || 0));
proc.on('error', (err) => { console.error('Failed to start Electron:', err); process.exit(1); });
