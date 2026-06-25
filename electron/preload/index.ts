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
  CheckpointReadChapter: 'checkpoint:read-chapter',
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

// Streaming request/response over a MessageChannelMain port. Mirrors
// electron/main/ipc/stream.ts — keep the `kind` strings in sync. We open
// a MessageChannel, ship one port to main with the request, then collect
// streamed items via `onItem` until a terminal `done`/`error`.
function streamInvoke(
  channel: string,
  req: unknown,
  onItem: (item: unknown) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { port1, port2 } = new MessageChannel();
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      port1.close();
      fn();
    };
    port1.onmessage = (e: MessageEvent) => {
      const msg = e.data as { kind: string; item?: unknown; message?: string };
      if (msg.kind === 'item') onItem(msg.item);
      else if (msg.kind === 'done') finish(() => resolve());
      else if (msg.kind === 'error')
        finish(() => reject(new Error(msg.message ?? 'IPC stream error')));
    };
    port1.start();
    // Hand port2 to main, then post the request payload onto port1; the
    // message queues until main starts its end.
    ipcRenderer.postMessage(channel, null, [port2]);
    port1.postMessage(req);
  });
}

const bridge = Object.freeze({
  app: Object.freeze({
    getVersion: () => ipcRenderer.invoke(C.AppGetVersion),
    getPlatform: () => ipcRenderer.invoke(C.AppGetPlatform),
  }),
  pdf: Object.freeze({
    rasterise: (req: unknown, onPage: (item: unknown) => void) =>
      streamInvoke(C.PdfRasterise, req, onPage),
  }),
  image: Object.freeze({
    filter: (req: unknown, onPage: (item: unknown) => void) =>
      streamInvoke(C.ImageFilter, req, onPage),
  }),
  audio: Object.freeze({
    stitch: (req: unknown) => ipcRenderer.invoke(C.AudioStitch, req),
  }),
  checkpoint: Object.freeze({
    saveMeta: (req: unknown) => ipcRenderer.invoke(C.CheckpointSaveMeta, req),
    loadMeta: (req: unknown) => ipcRenderer.invoke(C.CheckpointLoadMeta, req),
    writeChapter: (req: unknown) => ipcRenderer.invoke(C.CheckpointWriteChapter, req),
    readChapter: (req: unknown) => ipcRenderer.invoke(C.CheckpointReadChapter, req),
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
