// zod schemas for every IPC request + response.
// Main process MUST validate inputs through these before doing anything.
// Renderer MUST validate responses to defend against a compromised main.

import { z } from 'zod';

// ─── Common ────────────────────────────────────────────────────────────

export const SessionIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._-]+$/);
export const ChapterIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._-]+$/);
export const BytesRefSchema = z.string().min(1).max(256);

// ─── App lifecycle ─────────────────────────────────────────────────────

export const AppGetVersionResponseSchema = z.object({
  version: z.string(),
  electronVersion: z.string(),
  nodeVersion: z.string(),
});
export type AppGetVersionResponse = z.infer<typeof AppGetVersionResponseSchema>;

export const AppGetPlatformResponseSchema = z.object({
  platform: z.enum(['win32', 'darwin', 'linux']),
  arch: z.enum(['x64', 'arm64', 'ia32']),
});
export type AppGetPlatformResponse = z.infer<typeof AppGetPlatformResponseSchema>;

// ─── PDF rasterisation ─────────────────────────────────────────────────
// Note: bytes cross the IPC as raw Uint8Array (structured-clone). The
// BlobRegistry on the renderer side maps these to Blob URLs locally —
// refs do NOT cross the IPC, because each process owns its own registry.

export const PdfRasteriseRequestSchema = z.object({
  pdfBytes: z.instanceof(Uint8Array),
  // Cap on per-page dimension. Protects main memory.
  maxDimPx: z.number().int().positive().max(8192).default(2048),
});
export type PdfRasteriseRequest = z.infer<typeof PdfRasteriseRequestSchema>;

export interface RasterisedPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly jpegBytes: Uint8Array;
}
export interface PdfRasteriseResponse {
  readonly pages: readonly RasterisedPage[];
}

// ─── Image filter ──────────────────────────────────────────────────────

export const FilterSettingsSchema = z.object({
  cropTopPct: z.number().min(0).max(0.4),
  cropBottomPct: z.number().min(0).max(0.4),
  blankStddev: z.number().min(0).max(255),
  blankMean: z.number().min(0).max(255),
  dedupeThreshold: z.number().int().min(0).max(64),
  dedupeLookback: z.number().int().min(1).max(20),
});
export interface ImageFilterRequest {
  readonly pages: readonly { index: number; jpegBytes: Uint8Array }[];
  readonly settings: z.infer<typeof FilterSettingsSchema>;
}

export interface FilteredOutPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly jpegBytes: Uint8Array;
  readonly kept: boolean;
  readonly reason: string;
  readonly phash: string;
}
export interface ImageFilterResponse {
  readonly filtered: readonly FilteredOutPage[];
}

// ─── Audio stitch ──────────────────────────────────────────────────────

export const AudioStitchRequestSchema = z.object({
  segmentBytesRefs: z.array(BytesRefSchema).min(1),
  sentenceTexts: z.array(z.string()),
});
export type AudioStitchRequest = z.infer<typeof AudioStitchRequestSchema>;

export const AudioStitchResponseSchema = z.object({
  mp3BytesRef: BytesRefSchema,
  durationSec: z.number().positive(),
  srt: z.string(),
});
export type AudioStitchResponse = z.infer<typeof AudioStitchResponseSchema>;

// ─── Checkpoint disk ───────────────────────────────────────────────────

export const CheckpointSaveMetaRequestSchema = z.object({
  sessionId: SessionIdSchema,
  meta: z.record(z.unknown()),
});
export type CheckpointSaveMetaRequest = z.infer<typeof CheckpointSaveMetaRequestSchema>;

export const CheckpointWriteChapterRequestSchema = z.object({
  sessionId: SessionIdSchema,
  chapterIndex: z.number().int().nonnegative(),
  scriptJson: z.record(z.unknown()),
  // Image buffers shipped via MessageChannelMain in a separate IPC; this
  // payload only carries their refs.
  imageBytesRefs: z.array(BytesRefSchema),
});
export type CheckpointWriteChapterRequest = z.infer<typeof CheckpointWriteChapterRequestSchema>;

// ─── Dialogs ───────────────────────────────────────────────────────────

export const DialogPickPdfsResponseSchema = z.object({
  files: z.array(
    z.object({
      name: z.string(),
      bytesRef: BytesRefSchema,
    }),
  ),
});
export type DialogPickPdfsResponse = z.infer<typeof DialogPickPdfsResponseSchema>;

export const DialogSaveZipRequestSchema = z.object({
  zipBytesRef: BytesRefSchema,
  suggestedName: z.string().regex(/^[^\\/:*?"<>|]+\.zip$/),
});
export const DialogSaveZipResponseSchema = z.object({
  savedPath: z.string().nullable(),
});
export type DialogSaveZipResponse = z.infer<typeof DialogSaveZipResponseSchema>;

// ─── Secrets ───────────────────────────────────────────────────────────

export const SecretsKeySchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._-]+$/);

export const SecretsGetRequestSchema = z.object({ key: SecretsKeySchema });
export const SecretsGetResponseSchema = z.object({ value: z.string().nullable() });
export const SecretsSetRequestSchema = z.object({
  key: SecretsKeySchema,
  value: z.string().max(8192),
});

// ─── Updater + Stage events ────────────────────────────────────────────

export const UpdaterStatusSchema = z.object({
  state: z.enum(['idle', 'checking', 'available', 'downloading', 'ready', 'error']),
  version: z.string().optional(),
  progressPct: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
});
export type UpdaterStatus = z.infer<typeof UpdaterStatusSchema>;

export const StageEventSchema = z.object({
  stage: z.enum(['extract', 'filter', 'bible', 'chunk', 'narrate', 'polish', 'structural', 'accuracy', 'assemble', 'tts']),
  phase: z.enum(['start', 'progress', 'end', 'error']),
  chapterId: ChapterIdSchema.optional(),
  progress: z.number().min(0).max(1).optional(),
  message: z.string().optional(),
  tsMs: z.number(),
});
export type StageEvent = z.infer<typeof StageEventSchema>;
