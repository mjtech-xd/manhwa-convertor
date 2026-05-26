// Electron main process entry.
// Responsibilities:
//   • App lifecycle (single-instance, ready, window-all-closed, activate)
//   • Strict-CSP BrowserWindow creation
//   • IPC handler registration (see ./ipc/)
//   • Worker pool spawn (lazy on first use)

import { app, BrowserWindow, session, shell } from 'electron';
import * as path from 'node:path';
import { registerIpcHandlers } from './ipc';

const isDev = process.env['NODE_ENV'] === 'development';
const RENDERER_DEV_URL = 'http://localhost:4200';
const RENDERER_PROD_INDEX = path.join(__dirname, '../../dist/renderer/browser/index.html');

let mainWindow: BrowserWindow | null = null;

// ─── Single-instance lock ─────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── Strict navigation / window-open policy ───────────────────────────
function lockDownWebContents(contents: Electron.WebContents): void {
  // Block all new-window opens; route to OS browser if it's an https URL.
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Block in-place navigation away from the renderer origin.
  contents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    const allowed = isDev
      ? target.origin === RENDERER_DEV_URL
      : target.protocol === 'file:';
    if (!allowed) event.preventDefault();
  });
}

// ─── CSP header injection (cannot be overridden by injected <meta>) ────
function attachCsp(): void {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",            // Angular component styles
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://generativelanguage.googleapis.com https://openrouter.ai https://*.ai33.pro",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

// ─── Window creation ──────────────────────────────────────────────────
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Manhwa Convertor',
    backgroundColor: '#0b0b0e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  lockDownWebContents(mainWindow.webContents);

  if (isDev) {
    void mainWindow.loadURL(RENDERER_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(RENDERER_PROD_INDEX);
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => (mainWindow = null));
}

// ─── Boot ─────────────────────────────────────────────────────────────
void app.whenReady().then(() => {
  attachCsp();
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
