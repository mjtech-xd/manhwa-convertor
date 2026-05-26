// Single source of truth for every IPC channel name.
// Renderer + main process both import from here so a typo breaks at compile time.

export const IPC_CHANNELS = {
  // ─── App lifecycle ────────────────────────────────────────────────────
  AppGetVersion: 'app:get-version',
  AppGetPlatform: 'app:get-platform',

  // ─── PDF rasterisation (renderer → main worker) ───────────────────────
  PdfRasterise: 'pdf:rasterise',

  // ─── Image filtering (renderer → main worker) ─────────────────────────
  ImageFilter: 'image:filter',

  // ─── TTS audio stitching (renderer → main worker) ─────────────────────
  AudioStitch: 'audio:stitch',

  // ─── Checkpoint disk persistence (mirror of legacy electron/main.cjs) ─
  CheckpointSaveMeta: 'checkpoint:save-meta',
  CheckpointLoadMeta: 'checkpoint:load-meta',
  CheckpointWriteChapter: 'checkpoint:write-chapter',
  CheckpointReadChapter: 'checkpoint:read-chapter',
  CheckpointListSessions: 'checkpoint:list-sessions',
  CheckpointDeleteSession: 'checkpoint:delete-session',

  // ─── Native file dialogs ──────────────────────────────────────────────
  DialogPickPdfs: 'dialog:pick-pdfs',
  DialogSaveZip: 'dialog:save-zip',

  // ─── Secret storage (keychain / safeStorage) ──────────────────────────
  SecretsGet: 'secrets:get',
  SecretsSet: 'secrets:set',
  SecretsList: 'secrets:list',
  SecretsRemove: 'secrets:remove',

  // ─── Auto-updater (main → renderer broadcasts) ────────────────────────
  UpdaterStatus: 'updater:status',
  UpdaterApply: 'updater:apply',

  // ─── Stage progress events (main → renderer broadcasts) ───────────────
  StageEvent: 'stage:event',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
