// Ports — interfaces the application layer depends on. Adapters in
// `infrastructure` implement these. Tests provide fakes.

import { InjectionToken } from '@angular/core';
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
  readonly previousScript: string;          // rolling context
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
  checkAccuracy(script: string, scenes: readonly Scene[], tier: ModelTier): Promise<{ issues: readonly string[] }>;
}

export const GEMINI_PORT = new InjectionToken<GeminiPort>('GeminiPort');

export interface OpenRouterPort {
  fallbackNarrate(req: NarrateRequest): Promise<NarrateResult>;
}

export const OPENROUTER_PORT = new InjectionToken<OpenRouterPort>('OpenRouterPort');

// ─── TTS port ───────────────────────────────────────────────────────────

export interface TtsRenderRequest {
  readonly chapterId: ChapterId;
  readonly script: string;
  readonly voiceId: string;
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
  filter(pages: readonly ExtractedPage[], settings: FilterSettings): Promise<readonly FilteredPage[]>;
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

// ─── Logging / events ───────────────────────────────────────────────────

export interface StageEvent {
  readonly stage: 'extract' | 'filter' | 'bible' | 'chunk' | 'narrate' | 'polish' | 'structural' | 'accuracy' | 'assemble' | 'tts';
  readonly phase: 'start' | 'progress' | 'end' | 'error';
  readonly chapterId?: ChapterId;
  readonly progress?: number;       // 0..1
  readonly message?: string;
  readonly tsMs: number;
}

export interface EventBusPort {
  emit(event: StageEvent): void;
  onStage(handler: (event: StageEvent) => void): () => void;   // returns unsubscribe
}

export const EVENT_BUS_PORT = new InjectionToken<EventBusPort>('EventBusPort');
