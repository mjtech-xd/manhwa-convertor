// The exact API the preload script exposes to the renderer via contextBridge.
// `window.mc` in the renderer = ManhwaConvertorBridge.

import type {
  AppGetPlatformResponse,
  AppGetVersionResponse,
  AudioStitchRequest,
  AudioStitchResponse,
  CheckpointLoadMetaRequest,
  CheckpointReadChapterRequest,
  CheckpointSaveMetaRequest,
  CheckpointWriteChapterRequest,
  DialogPickPdfsResponse,
  DialogSaveZipResponse,
  FilteredOutPage,
  ImageFilterRequest,
  PdfRasteriseRequest,
  RasterisedPage,
  StageEvent,
  UpdaterStatus,
} from './payloads';

// Re-export RasterisedPage/FilteredOutPage so consumers can import from one place.
export type { RasterisedPage, FilteredOutPage } from './payloads';

/** Called once per item streamed back from a streaming IPC channel. */
export type StreamItemHandler<T> = (item: T) => void;

export interface ManhwaConvertorBridge {
  readonly app: {
    getVersion(): Promise<AppGetVersionResponse>;
    getPlatform(): Promise<AppGetPlatformResponse>;
  };
  readonly pdf: {
    /** Streams rasterised pages via `onPage`; resolves when the stream ends. */
    rasterise(req: PdfRasteriseRequest, onPage: StreamItemHandler<RasterisedPage>): Promise<void>;
  };
  readonly image: {
    /** Streams filtered pages via `onPage`; resolves when the stream ends. */
    filter(req: ImageFilterRequest, onPage: StreamItemHandler<FilteredOutPage>): Promise<void>;
  };
  readonly audio: {
    stitch(req: AudioStitchRequest): Promise<AudioStitchResponse>;
  };
  readonly checkpoint: {
    saveMeta(req: CheckpointSaveMetaRequest): Promise<void>;
    loadMeta(req: CheckpointLoadMetaRequest): Promise<unknown | null>;
    writeChapter(req: CheckpointWriteChapterRequest): Promise<void>;
    readChapter(req: CheckpointReadChapterRequest): Promise<unknown | null>;
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
