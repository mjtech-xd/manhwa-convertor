// Preload script. Runs with contextIsolation: true; exposes a frozen,
// narrowly-typed bridge to the renderer via contextBridge.

import { contextBridge, ipcRenderer } from 'electron';

// NOTE: cannot import from `shared-ipc` library here because the preload
// runs before any Angular bundling. Channel names are inlined to keep
// the preload self-contained and small. They must stay in sync with
// projects/shared-ipc/src/lib/channels.ts (one source of truth doc'd
// in CLAUDE.md; both are short and reviewed together).

const C = {
  AppGetVersion: 'app:get-version',
  AppGetPlatform: 'app:get-platform',
  PdfRasterise: 'pdf:rasterise',
  ImageFilter: 'image:filter',
  AudioStitch: 'audio:stitch',
  CheckpointSaveMeta: 'checkpoint:save-meta',
  CheckpointLoadMeta: 'checkpoint:load-meta',
  CheckpointWriteChapter: 'checkpoint:write-chapter',
  CheckpointListSessions: 'checkpoint:list-sessions',
  CheckpointDeleteSession: 'checkpoint:delete-session',
  DialogPickPdfs: 'dialog:pick-pdfs',
  DialogSaveZip: 'dialog:save-zip',
  SecretsGet: 'secrets:get',
  SecretsSet: 'secrets:set',
  SecretsList: 'secrets:list',
  SecretsRemove: 'secrets:remove',
  UpdaterStatus: 'updater:status',
  UpdaterApply: 'updater:apply',
  StageEvent: 'stage:event',
} as const;

function subscribe<T>(channel: string, handler: (data: T) => void): () => void {
  const wrapped = (_e: unknown, data: T) => handler(data);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const bridge = Object.freeze({
  app: Object.freeze({
    getVersion: () => ipcRenderer.invoke(C.AppGetVersion),
    getPlatform: () => ipcRenderer.invoke(C.AppGetPlatform),
  }),
  pdf: Object.freeze({
    rasterise: (req: unknown) => ipcRenderer.invoke(C.PdfRasterise, req),
  }),
  image: Object.freeze({
    filter: (req: unknown) => ipcRenderer.invoke(C.ImageFilter, req),
  }),
  audio: Object.freeze({
    stitch: (req: unknown) => ipcRenderer.invoke(C.AudioStitch, req),
  }),
  checkpoint: Object.freeze({
    saveMeta: (req: unknown) => ipcRenderer.invoke(C.CheckpointSaveMeta, req),
    loadMeta: (req: unknown) => ipcRenderer.invoke(C.CheckpointLoadMeta, req),
    writeChapter: (req: unknown) => ipcRenderer.invoke(C.CheckpointWriteChapter, req),
    listSessions: () => ipcRenderer.invoke(C.CheckpointListSessions),
    deleteSession: (sessionId: string) => ipcRenderer.invoke(C.CheckpointDeleteSession, sessionId),
  }),
  dialog: Object.freeze({
    pickPdfs: () => ipcRenderer.invoke(C.DialogPickPdfs),
    saveZip: (req: unknown) => ipcRenderer.invoke(C.DialogSaveZip, req),
  }),
  secrets: Object.freeze({
    get: (key: string) => ipcRenderer.invoke(C.SecretsGet, { key }),
    set: (key: string, value: string) => ipcRenderer.invoke(C.SecretsSet, { key, value }),
    list: () => ipcRenderer.invoke(C.SecretsList),
    remove: (key: string) => ipcRenderer.invoke(C.SecretsRemove, { key }),
  }),
  updater: Object.freeze({
    onStatus: (handler: (status: unknown) => void) => subscribe(C.UpdaterStatus, handler),
    apply: () => ipcRenderer.invoke(C.UpdaterApply),
  }),
  stage: Object.freeze({
    onEvent: (handler: (event: unknown) => void) => subscribe(C.StageEvent, handler),
  }),
});

contextBridge.exposeInMainWorld('mc', bridge);
