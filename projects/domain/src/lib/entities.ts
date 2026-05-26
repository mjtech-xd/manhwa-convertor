// Domain entities — pure data shapes. No methods, no DOM, no Angular.

import type { ApiKeyId, ChapterId, IsoDate, IsoDateTime, ModelTier, SceneId, SessionId, Dimensions } from './value-objects';

/**
 * One PDF page extracted to bytes. Lives by ID in a BlobRegistry — the
 * actual bytes never live in the signal store (see CLAUDE.md §8).
 */
export interface ExtractedPage {
  readonly index: number;          // 1-based, matches user's mental model
  readonly dimensions: Dimensions;
  readonly bytesRef: string;       // BlobRegistry key
}

/** One filtered (cropped + retained or rejected) page. */
export interface FilteredPage {
  readonly index: number;
  readonly dimensions: Dimensions;
  readonly bytesRef: string;
  readonly kept: boolean;
  readonly reason: string;
  readonly phash: string;
}

/** Tunable filter thresholds. */
export interface FilterSettings {
  readonly cropTopPct: number;
  readonly cropBottomPct: number;
  readonly blankStddev: number;
  readonly blankMean: number;
  readonly dedupeThreshold: number;
  readonly dedupeLookback: number;
}

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  cropTopPct: 0.04,
  cropBottomPct: 0.04,
  blankStddev: 6,
  blankMean: 240,
  dedupeThreshold: 8,
  dedupeLookback: 3,
};

/** Character bible — what Gemini extracted about the cast / setting. */
export interface CharacterBible {
  readonly characters: readonly {
    readonly name: string;
    readonly description: string;
    readonly aliases: readonly string[];
  }[];
  readonly setting: string;
  readonly tone: string;
}

/** A scene = group of consecutive panels narrated as one beat. */
export interface Scene {
  readonly id: SceneId;
  readonly panelIndices: readonly number[];
  readonly narration: string;
}

/** A full chapter, post-pipeline. */
export interface Chapter {
  readonly id: ChapterId;
  readonly sessionId: SessionId;
  readonly title: string;
  readonly sourcePdfName: string;
  readonly bible: CharacterBible;
  readonly scenes: readonly Scene[];
  readonly script: string;
  readonly srt: string | null;
  readonly status: ChapterStatus;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export type ChapterStatus =
  | 'pending'
  | 'extracting'
  | 'filtering'
  | 'narrating'
  | 'polishing'
  | 'completed'
  | 'failed';

/** Top-level run that groups N chapters with a shared master bible. */
export interface Session {
  readonly id: SessionId;
  readonly title: string;
  readonly masterBible: CharacterBible;
  readonly chapterIds: readonly ChapterId[];
  readonly createdAt: IsoDateTime;
}

/** API key + usage tracking. */
export interface ApiKey {
  readonly id: ApiKeyId;
  readonly label: string;
  readonly secret: string;
  readonly provider: ApiKeyProvider;
  readonly addedAt: IsoDateTime;
}

export type ApiKeyProvider = 'gemini' | 'openrouter' | 'ai33';

export interface ApiKeyUsage {
  readonly keyId: ApiKeyId;
  readonly usageDay: number;
  readonly resetDate: IsoDate;
  readonly recentRequestTimestamps: readonly number[];   // epoch ms, last minute
}

export interface KeyLimits {
  readonly dailyCap: number;
  readonly perMinuteCap: number;
}

export const DEFAULT_KEY_LIMITS: KeyLimits = {
  dailyCap: 500,
  perMinuteCap: 15,
};

/** Selected model + tier per stage. */
export interface ModelSelection {
  readonly bible: ModelTier;
  readonly narrate: ModelTier;
  readonly polish: ModelTier;
  readonly structural: ModelTier;
  readonly accuracy: ModelTier;
}

/** A TTS render job. */
export interface VoiceTrack {
  readonly chapterId: ChapterId;
  readonly voiceId: string;
  readonly mp3Ref: string;     // BlobRegistry key
  readonly srt: string;
  readonly durationSec: number;
}
