# electron/

Electron main + preload sources. Built with `tsc` (not Angular CLI) — see [`tsconfig.json`](./tsconfig.json) — into `../dist-electron/`.

## Layout

```
electron/
├─ main/
│  ├─ index.ts        # Lifecycle, BrowserWindow, CSP
│  └─ ipc/            # IPC handlers (to add: checkpoint, pdf, image, audio, dialog, secrets)
├─ preload/
│  └─ index.ts        # contextBridge → window.mc (typed surface)
├─ workers/           # node:worker_threads (to add: pdf-rasteriser, image-filter, audio-stitcher)
└─ tsconfig.json
```

## Security defaults (don't weaken)

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- CSP set via `webRequest.onHeadersReceived` (so injected `<meta>` cannot override).
- All `setWindowOpenHandler` calls return `{ action: 'deny' }`; https URLs route via `shell.openExternal`.

## Build

```bash
npm run electron:build       # tsc → dist-electron/
npm run electron:dev         # Angular dev server + Electron with hot reload
npm run dist                 # electron-builder packages signed artefacts
```
