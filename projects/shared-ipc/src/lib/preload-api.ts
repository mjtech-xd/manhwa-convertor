// The exact API the preload script exposes to the renderer via contextBridge.
// `window.mc` in the renderer = ManhwaConvertorBridge.

import type {
  AppGetPlatformResponse,
  AppGetVersionResponse,
  AudioStitchRequest,
  AudioStitchResponse,
  CheckpointLoadMetaRequest,
  CheckpointSaveMetaRequest,
  CheckpointWriteChapterRequest,
  DialogPickPdfsResponse,
  DialogSaveZipResponse,
  ImageFilterRequest,
  ImageFilterResponse,
  PdfRasteriseRequest,
  PdfRasteriseResponse,
  StageEvent,
  UpdaterStatus,
} from './payloads';

// Re-export RasterisedPage/FilteredOutPage so consumers can import from one place.
export type { RasterisedPage, FilteredOutPage } from './payloads';

export interface ManhwaConvertorBridge {
  readonly app: {
    getVersion(): Promise<AppGetVersionResponse>;
    getPlatform(): Promise<AppGetPlatformResponse>;
  };
  readonly pdf: {
    rasterise(req: PdfRasteriseRequest): Promise<PdfRasteriseResponse>;
  };
  readonly image: {
    filter(req: ImageFilterRequest): Promise<ImageFilterResponse>;
  };
  readonly audio: {
    stitch(req: AudioStitchRequest): Promise<AudioStitchResponse>;
  };
  readonly checkpoint: {
    saveMeta(req: CheckpointSaveMetaRequest): Promise<void>;
    loadMeta(req: CheckpointLoadMetaRequest): Promise<unknown | null>;
    writeChapter(req: CheckpointWriteChapterRequest): Promise<void>;
    listSessions(): Promise<readonly string[]>;
    deleteSession(sessionId: string): Promise<void>;
  };
  readonly dialog: {
    pickPdfs(): Promise<DialogPickPdfsResponse>;
    saveZip(req: { zipBytesRef: string; suggestedName: string }): Promise<DialogSaveZipResponse>;
  };
  readonly secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    list(): Promise<readonly string[]>;
    remove(key: string): Promise<void>;
  };
  readonly updater: {
    onStatus(handler: (status: UpdaterStatus) => void): () => void;
    apply(): Promise<void>;
  };
  readonly stage: {
    onEvent(handler: (event: StageEvent) => void): () => void;
  };
}

declare global {
  interface Window {
    readonly mc?: ManhwaConvertorBridge;
  }
}
