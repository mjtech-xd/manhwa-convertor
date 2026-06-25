// Ports — interfaces the application layer depends on. Adapters in
// `infrastructure` implement these. Tests provide fakes.

import { InjectionToken, type Signal } from '@angular/core';
import type {
  ApiKey,
  ApiKeyUsage,
  CharacterBible,
  Chapter,
  ExtractedPage,
  FilterSettings,
  FilteredPage,
  Scene,
  Session,
  VoiceTrack,
} from './entities';
import type { ChapterId, ModelTier, SessionId } from './value-objects';

// ─── LLM ports ──────────────────────────────────────────────────────────

export interface NarrateRequest {
  readonly bible: CharacterBible;
  readonly previousScript: string; // rolling context
  readonly panelBytesRefs: readonly string[];
  readonly tier: ModelTier;
}

export interface NarrateResult {
  readonly narration: string;
  readonly modelUsed: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

export interface GeminiPort {
  narrate(req: NarrateRequest): Promise<NarrateResult>;
  buildBible(panelBytesRefs: readonly string[], tier: ModelTier): Promise<CharacterBible>;
  polishScript(script: string, bible: CharacterBible, tier: ModelTier): Promise<string>;
  structuralEdit(script: string, bible: CharacterBible, tier: ModelTier): Promise<string>;
  checkAccuracy(
    script: string,
    scenes: readonly Scene[],
    tier: ModelTier,
  ): Promise<{ issues: readonly string[] }>;
}

export const GEMINI_PORT = new InjectionToken<GeminiPort>('GeminiPort');

export interface OpenRouterPort {
  fallbackNarrate(req: NarrateRequest): Promise<NarrateResult>;
}

export const OPENROUTER_PORT = new InjectionToken<OpenRouterPort>('OpenRouterPort');

// ─── TTS port ───────────────────────────────────────────────────────────

export interface TtsLineEvent {
  readonly index: number;
  readonly total: number;
  readonly status: 'done' | 'failed';
  readonly error?: string;
}

export interface TtsRenderRequest {
  readonly chapterId: ChapterId;
  readonly script: string;
  readonly voiceId: string;
  /** Milliseconds of silence inserted between lines. Default 400. */
  readonly silenceMs?: number;
  /** Fired after each line completes (success or fail). */
  readonly onLine?: (event: TtsLineEvent) => void;
  /** Checked between lines; returning true aborts cleanly. */
  readonly isCancelled?: () => boolean;
}

export interface TtsPort {
  render(req: TtsRenderRequest): Promise<VoiceTrack>;
  listVoices(): Promise<readonly { id: string; name: string }[]>;
}

export const TTS_PORT = new InjectionToken<TtsPort>('TtsPort');

// ─── PDF / image ports (implemented in Electron workers) ────────────────

export interface PdfRasteriserPort {
  rasterise(pdfBytesRef: string): Promise<readonly ExtractedPage[]>;
}

export const PDF_RASTERISER_PORT = new InjectionToken<PdfRasteriserPort>('PdfRasteriserPort');

export interface ImageFilterPort {
  filter(
    pages: readonly ExtractedPage[],
    settings: FilterSettings,
  ): Promise<readonly FilteredPage[]>;
}

export const IMAGE_FILTER_PORT = new InjectionToken<ImageFilterPort>('ImageFilterPort');

// ─── Storage ────────────────────────────────────────────────────────────

export interface ChapterRepoPort {
  save(chapter: Chapter): Promise<void>;
  load(id: ChapterId): Promise<Chapter | null>;
  listForSession(sessionId: SessionId): Promise<readonly Chapter[]>;
  delete(id: ChapterId): Promise<void>;
}

export const CHAPTER_REPO_PORT = new InjectionToken<ChapterRepoPort>('ChapterRepoPort');

export interface SessionRepoPort {
  save(session: Session): Promise<void>;
  load(id: SessionId): Promise<Session | null>;
  list(): Promise<readonly Session[]>;
}

export const SESSION_REPO_PORT = new InjectionToken<SessionRepoPort>('SessionRepoPort');

export interface ApiKeyRepoPort {
  list(): Promise<readonly ApiKey[]>;
  add(key: ApiKey): Promise<void>;
  remove(id: ApiKey['id']): Promise<void>;
  getUsage(id: ApiKey['id']): Promise<ApiKeyUsage>;
  recordUsage(id: ApiKey['id']): Promise<void>;
}

export const API_KEY_REPO_PORT = new InjectionToken<ApiKeyRepoPort>('ApiKeyRepoPort');

// ─── Blob registry ──────────────────────────────────────────────────────

export interface BlobRegistryPort {
  put(bytes: ArrayBuffer | Uint8Array, mime: string): string;
  get(ref: string): Promise<ArrayBuffer | null>;
  url(ref: string): string | null;
  revoke(ref: string): void;
}

export const BLOB_REGISTRY_PORT = new InjectionToken<BlobRegistryPort>('BlobRegistryPort');

// ─── File I/O (Electron disk) ───────────────────────────────────────────

export interface FilePort {
  saveZip(sessionId: SessionId, zipBytesRef: string, suggestedName: string): Promise<string>; // returns saved path
  pickPdfs(): Promise<readonly { name: string; bytesRef: string }[]>;
}

export const FILE_PORT = new InjectionToken<FilePort>('FilePort');

// ─── Assembler ──────────────────────────────────────────────────────────

export interface AssemblerPort {
  /**
   * Build a chapter ZIP (script.txt + script.srt + panel JPEGs +
   * manifest.json) and stash it in the BlobRegistry. Returns the
   * ref plus the suggested download filename.
   */
  buildChapterZip(
    chapter: Chapter,
    keptPages: readonly FilteredPage[],
  ): Promise<{ readonly zipRef: string; readonly suggestedName: string }>;
}

export const ASSEMBLER_PORT = new InjectionToken<AssemblerPort>('AssemblerPort');

// ─── Checkpoint (disk-backed bulk-run recovery) ─────────────────────────

export interface CheckpointChapterMeta {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly hasScript: boolean;
}

export interface CheckpointSessionMeta {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** 'running' while a run is in flight — a persisted 'running' on next
   *  launch means the run was interrupted (hard kill). */
  readonly status: 'running' | 'done' | 'failed' | 'cancelled';
  readonly masterBible: CharacterBible | null;
  readonly chapters: readonly CheckpointChapterMeta[];
}

/** One completed chapter's recoverable text payload (no image bytes). */
export interface CheckpointChapterScript {
  readonly index: number;
  readonly name: string;
  readonly script: string;
  readonly bible: CharacterBible;
}

export interface CheckpointPort {
  /** False in the browser dev build (no Electron bridge) — callers no-op. */
  isAvailable(): boolean;
  saveMeta(meta: CheckpointSessionMeta): Promise<void>;
  loadMeta(sessionId: string): Promise<CheckpointSessionMeta | null>;
  writeChapter(sessionId: string, index: number, script: CheckpointChapterScript): Promise<void>;
  readChapter(sessionId: string, index: number): Promise<CheckpointChapterScript | null>;
  listSessions(): Promise<readonly string[]>;
  deleteSession(sessionId: string): Promise<void>;
}

export const CHECKPOINT_PORT = new InjectionToken<CheckpointPort>('CheckpointPort');

// ─── Logging / events ───────────────────────────────────────────────────

export interface StageEvent {
  readonly stage:
    | 'extract'
    | 'filter'
    | 'bible'
    | 'chunk'
    | 'narrate'
    | 'polish'
    | 'structural'
    | 'accuracy'
    | 'assemble'
    | 'tts';
  readonly phase: 'start' | 'progress' | 'end' | 'error';
  readonly chapterId?: ChapterId;
  readonly progress?: number; // 0..1
  readonly message?: string;
  readonly tsMs: number;
}

export interface EventBusPort {
  emit(event: StageEvent): void;
  onStage(handler: (event: StageEvent) => void): () => void; // returns unsubscribe
}

export const EVENT_BUS_PORT = new InjectionToken<EventBusPort>('EventBusPort');

// ─── Stage timing (p50/p95 telemetry, CLAUDE.md §12) ────────────────────

export interface StageTimingSummary {
  readonly stage: StageEvent['stage'];
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly lastMs: number;
}

/**
 * Aggregates per-stage durations from EventBus start/end events and
 * exposes p50/p95. Read-only to consumers (the Debug panel); the
 * implementation subscribes to the bus itself.
 */
export interface StageTimingPort {
  readonly summary: Signal<readonly StageTimingSummary[]>;
  reset(): void;
}

export const STAGE_TIMING_PORT = new InjectionToken<StageTimingPort>('StageTimingPort');
