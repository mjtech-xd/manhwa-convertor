// Single-chapter pipeline orchestrator. Composes the eight stage
// use-cases (extract → filter → bible → chunk → narrate → polish →
// structural → accuracy → assemble) into one async call.
//
// Callers subscribe to onStage for incremental UI updates and receive
// the final outcome via the returned `RunChapterOutput`. Cancellation
// is co-operative: the caller's `isCancelled()` is checked between
// stages and between narrate scenes — the in-flight HTTP completes,
// then the pipeline bails.
//
// Master-bible threading: pass `bibleOverride` to skip the bible
// stage and reuse a previously-extracted bible (bulk mode shares the
// first chapter's bible across subsequent ones).
//
// Blob lifecycle: the orchestrator does NOT revoke blob refs it
// allocates. Callers receive `extractedPagesRefs` + `filteredPagesRefs`
// in the result and revoke whenever fits their UI lifecycle (single
// mode keeps them for the image grid; bulk mode revokes after
// assemble).

import { Injectable, inject } from '@angular/core';
import {
  BLOB_REGISTRY_PORT,
  ChapterId,
  DEFAULT_FILTER_SETTINGS,
  EVENT_BUS_PORT,
  IsoDateTime,
  SceneId,
  SessionId,
  type BlobRegistryPort,
  type Chapter,
  type CharacterBible,
  type EventBusPort,
  type ExtractedPage,
  type FilteredPage,
  type ModelTier,
  type Scene,
  type StageEvent,
} from '@mc/domain';
import { AssembleOutputUseCase } from './assemble-output.use-case';
import { BuildBibleUseCase } from './build-bible.use-case';
import { CheckAccuracyUseCase } from './check-accuracy.use-case';
import { ChunkScenesUseCase } from './chunk-scenes.use-case';
import { ExtractPdfUseCase } from './extract-pdf.use-case';
import { FilterPagesUseCase } from './filter-pages.use-case';
import { NarrateSceneUseCase } from './narrate-scene.use-case';
import { PolishScriptUseCase } from './polish-script.use-case';
import { StructuralEditUseCase } from './structural-edit.use-case';

export type ChapterStage =
  | 'extract'
  | 'filter'
  | 'bible'
  | 'narrate'
  | 'polish'
  | 'structural'
  | 'accuracy'
  | 'assemble';

export type RunChapterStageEvent =
  | { kind: 'extract.start' }
  | { kind: 'extract.done'; pages: readonly ExtractedPage[] }
  | { kind: 'extract.failed'; error: string }
  | { kind: 'filter.start' }
  | { kind: 'filter.done'; pages: readonly FilteredPage[] }
  | { kind: 'filter.failed'; error: string }
  | { kind: 'bible.start' }
  | { kind: 'bible.done'; bible: CharacterBible; skipped: boolean }
  | { kind: 'bible.failed'; error: string }
  | {
      kind: 'narrate.start';
      sceneCount: number;
      scenes: readonly { id: string; panelIndices: readonly number[] }[];
    }
  | { kind: 'narrate.scene-start'; index: number }
  | { kind: 'narrate.scene-done'; index: number; narration: string }
  | { kind: 'narrate.scene-failed'; index: number; error: string }
  | { kind: 'narrate.done'; anySucceeded: boolean; failedCount: number; totalCount: number }
  | { kind: 'polish.start' }
  | { kind: 'polish.done'; script: string }
  | { kind: 'polish.failed'; error: string }
  | { kind: 'structural.start' }
  | { kind: 'structural.done'; script: string }
  | { kind: 'structural.failed'; error: string }
  | { kind: 'accuracy.start' }
  | { kind: 'accuracy.done'; issues: readonly string[] }
  | { kind: 'accuracy.failed'; error: string }
  | { kind: 'assemble.start' }
  | { kind: 'assemble.done'; zipRef: string; suggestedName: string }
  | { kind: 'assemble.failed'; error: string }
  | { kind: 'pipeline.cancelled'; atStage: ChapterStage };

export interface RunChapterInput {
  readonly file: File;
  readonly tier: ModelTier;
  /** When set, skip the bible stage and use this bible for narrate / polish / structural. */
  readonly bibleOverride?: CharacterBible;
  /** Called before each stage + between narrate scenes. Returning true aborts cleanly. */
  readonly isCancelled?: () => boolean;
  /** Receives stage events for incremental UI updates. */
  readonly onStage?: (event: RunChapterStageEvent) => void;
}

export type RunChapterStatus = 'completed' | 'failed' | 'cancelled';

export interface RunChapterOutput {
  readonly status: RunChapterStatus;
  /** Stage at which a failure or cancellation occurred — null on completion. */
  readonly failedAt: ChapterStage | null;
  readonly error: string | null;
  /** Always populated, even on partial failure (for caller revocation). */
  readonly extractedPagesRefs: readonly string[];
  readonly filteredPagesRefs: readonly string[];
  readonly bible: CharacterBible | null;
  readonly chapter: Chapter | null;
  readonly zipRef: string | null;
  readonly suggestedName: string | null;
}

@Injectable({ providedIn: 'root' })
export class RunChapterUseCase {
  private readonly extractUc = inject(ExtractPdfUseCase);
  private readonly filterUc = inject(FilterPagesUseCase);
  private readonly bibleUc = inject(BuildBibleUseCase);
  private readonly chunkUc = inject(ChunkScenesUseCase);
  private readonly narrateUc = inject(NarrateSceneUseCase);
  private readonly polishUc = inject(PolishScriptUseCase);
  private readonly structuralUc = inject(StructuralEditUseCase);
  private readonly accuracyUc = inject(CheckAccuracyUseCase);
  private readonly assembleUc = inject(AssembleOutputUseCase);
  private readonly blobs: BlobRegistryPort = inject(BLOB_REGISTRY_PORT);
  private readonly bus: EventBusPort = inject(EVENT_BUS_PORT);

  async execute(input: RunChapterInput): Promise<RunChapterOutput> {
    // Correlates each stage's start/end on the telemetry bus across
    // concurrent runs (bulk mode); distinct from the final chapter id.
    const runId = ChapterId(`run-${Date.now().toString(36)}-${rand4()}`);
    const emit = (e: RunChapterStageEvent): void => {
      input.onStage?.(e);
      const tele = toStageEvent(e, runId);
      if (tele) this.bus.emit(tele);
    };
    const cancelled = (): boolean => input.isCancelled?.() ?? false;

    let extractedPagesRefs: readonly string[] = [];
    let filteredPagesRefs: readonly string[] = [];
    let bible: CharacterBible | null = input.bibleOverride ?? null;

    // 1. Stage the PDF bytes.
    const pdfBuf = await input.file.arrayBuffer();
    const pdfRef = this.blobs.put(pdfBuf, 'application/pdf');

    // 2. Extract.
    emit({ kind: 'extract.start' });
    let extracted: readonly ExtractedPage[];
    try {
      const r = await this.extractUc.execute({ pdfBytesRef: pdfRef, sourceName: input.file.name });
      extracted = r.pages;
      extractedPagesRefs = extracted.map((p) => p.bytesRef);
      emit({ kind: 'extract.done', pages: extracted });
    } catch (err) {
      this.blobs.revoke(pdfRef);
      const msg = stringifyError(err);
      emit({ kind: 'extract.failed', error: msg });
      return failResult('extract', msg, extractedPagesRefs, filteredPagesRefs, bible);
    } finally {
      this.blobs.revoke(pdfRef);
    }
    if (cancelled()) {
      emit({ kind: 'pipeline.cancelled', atStage: 'filter' });
      return cancelResult('filter', extractedPagesRefs, filteredPagesRefs, bible);
    }

    // 3. Filter.
    emit({ kind: 'filter.start' });
    let filtered: readonly FilteredPage[];
    try {
      const r = await this.filterUc.execute({
        pages: extracted,
        settings: DEFAULT_FILTER_SETTINGS,
      });
      filtered = r.filtered;
      filteredPagesRefs = filtered.map((p) => p.bytesRef);
      emit({ kind: 'filter.done', pages: filtered });
    } catch (err) {
      const msg = stringifyError(err);
      emit({ kind: 'filter.failed', error: msg });
      return failResult('filter', msg, extractedPagesRefs, filteredPagesRefs, bible);
    }
    const keptPages = filtered.filter((p) => p.kept);
    if (cancelled()) {
      emit({ kind: 'pipeline.cancelled', atStage: 'bible' });
      return cancelResult('bible', extractedPagesRefs, filteredPagesRefs, bible);
    }

    // 4. Bible — skipped if overridden.
    emit({ kind: 'bible.start' });
    if (bible) {
      emit({ kind: 'bible.done', bible, skipped: true });
    } else {
      try {
        const r = await this.bibleUc.execute({ pages: filtered, tier: input.tier });
        bible = r.bible;
        emit({ kind: 'bible.done', bible, skipped: false });
      } catch (err) {
        const msg = stringifyError(err);
        emit({ kind: 'bible.failed', error: msg });
        return failResult('bible', msg, extractedPagesRefs, filteredPagesRefs, bible);
      }
    }
    if (cancelled()) {
      emit({ kind: 'pipeline.cancelled', atStage: 'narrate' });
      return cancelResult('narrate', extractedPagesRefs, filteredPagesRefs, bible);
    }

    // 5. Chunk + Narrate.
    const { scenes: sceneChunks } = this.chunkUc.execute({ pages: filtered });
    emit({
      kind: 'narrate.start',
      sceneCount: sceneChunks.length,
      scenes: sceneChunks.map((sc) => ({
        id: String(sc.id),
        panelIndices: sc.panelIndices,
      })),
    });
    const refByIndex = new Map(keptPages.map((p) => [p.index, p.bytesRef]));
    let rollingScript = '';
    const completedScenes: Scene[] = [];
    let failedScenes = 0;
    for (let s = 0; s < sceneChunks.length; s++) {
      if (cancelled()) {
        emit({ kind: 'pipeline.cancelled', atStage: 'narrate' });
        return cancelResult('narrate', extractedPagesRefs, filteredPagesRefs, bible);
      }
      emit({ kind: 'narrate.scene-start', index: s });
      const refs = sceneChunks[s]!.panelIndices.map((idx) => refByIndex.get(idx)).filter(
        (r): r is string => !!r,
      );
      try {
        const r = await this.narrateUc.execute({
          bible,
          previousScript: rollingScript,
          panelBytesRefs: refs,
          tier: input.tier,
        });
        rollingScript = rollingScript ? `${rollingScript}\n\n${r.narration}` : r.narration;
        completedScenes.push({
          id: SceneId(String(sceneChunks[s]!.id)),
          panelIndices: sceneChunks[s]!.panelIndices,
          narration: r.narration,
        });
        emit({ kind: 'narrate.scene-done', index: s, narration: r.narration });
      } catch (err) {
        failedScenes++;
        emit({ kind: 'narrate.scene-failed', index: s, error: stringifyError(err) });
      }
    }
    const anySucceeded = completedScenes.length > 0;
    emit({
      kind: 'narrate.done',
      anySucceeded,
      failedCount: failedScenes,
      totalCount: sceneChunks.length,
    });
    if (!anySucceeded) {
      return failResult(
        'narrate',
        `no scenes succeeded (${failedScenes}/${sceneChunks.length} failed)`,
        extractedPagesRefs,
        filteredPagesRefs,
        bible,
      );
    }
    if (cancelled()) {
      emit({ kind: 'pipeline.cancelled', atStage: 'polish' });
      return cancelResult('polish', extractedPagesRefs, filteredPagesRefs, bible);
    }

    // 6. Polish.
    emit({ kind: 'polish.start' });
    let polishedScript: string;
    try {
      const r = await this.polishUc.execute({ script: rollingScript, bible, tier: input.tier });
      polishedScript = r.polished;
      emit({ kind: 'polish.done', script: polishedScript });
    } catch (err) {
      const msg = stringifyError(err);
      emit({ kind: 'polish.failed', error: msg });
      return failResult('polish', msg, extractedPagesRefs, filteredPagesRefs, bible);
    }
    if (cancelled()) {
      emit({ kind: 'pipeline.cancelled', atStage: 'structural' });
      return cancelResult('structural', extractedPagesRefs, filteredPagesRefs, bible);
    }

    // 7. Structural.
    emit({ kind: 'structural.start' });
    let editedScript: string;
    try {
      const r = await this.structuralUc.execute({
        script: polishedScript,
        bible,
        tier: input.tier,
      });
      editedScript = r.edited;
      emit({ kind: 'structural.done', script: editedScript });
    } catch (err) {
      const msg = stringifyError(err);
      emit({ kind: 'structural.failed', error: msg });
      return failResult('structural', msg, extractedPagesRefs, filteredPagesRefs, bible);
    }
    if (cancelled()) {
      emit({ kind: 'pipeline.cancelled', atStage: 'accuracy' });
      return cancelResult('accuracy', extractedPagesRefs, filteredPagesRefs, bible);
    }

    // 8. Accuracy. Non-blocking — failure surfaces an empty issue list.
    emit({ kind: 'accuracy.start' });
    let issues: readonly string[] = [];
    try {
      const r = await this.accuracyUc.execute({
        script: editedScript,
        scenes: completedScenes,
        tier: input.tier,
      });
      issues = r.issues;
      emit({ kind: 'accuracy.done', issues });
    } catch (err) {
      emit({ kind: 'accuracy.failed', error: stringifyError(err) });
    }
    if (cancelled()) {
      emit({ kind: 'pipeline.cancelled', atStage: 'assemble' });
      return cancelResult('assemble', extractedPagesRefs, filteredPagesRefs, bible);
    }

    // 9. Assemble.
    emit({ kind: 'assemble.start' });
    const now = IsoDateTime(new Date().toISOString());
    const chapter: Chapter = {
      id: ChapterId(`chapter-${Date.now().toString(36)}-${rand4()}`),
      sessionId: SessionId('session'),
      title: input.file.name.replace(/\.pdf$/i, ''),
      sourcePdfName: input.file.name,
      bible,
      scenes: completedScenes,
      script: editedScript,
      srt: null,
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    };
    let zipRef: string;
    let suggestedName: string;
    try {
      const r = await this.assembleUc.execute({ chapter, keptPages });
      zipRef = r.zipRef;
      suggestedName = r.suggestedName;
      emit({ kind: 'assemble.done', zipRef, suggestedName });
    } catch (err) {
      const msg = stringifyError(err);
      emit({ kind: 'assemble.failed', error: msg });
      return failResult('assemble', msg, extractedPagesRefs, filteredPagesRefs, bible);
    }

    return {
      status: 'completed',
      failedAt: null,
      error: null,
      extractedPagesRefs,
      filteredPagesRefs,
      bible,
      chapter,
      zipRef,
      suggestedName,
    };
  }
}

function failResult(
  stage: ChapterStage,
  error: string,
  extracted: readonly string[],
  filtered: readonly string[],
  bible: CharacterBible | null,
): RunChapterOutput {
  return {
    status: 'failed',
    failedAt: stage,
    error,
    extractedPagesRefs: extracted,
    filteredPagesRefs: filtered,
    bible,
    chapter: null,
    zipRef: null,
    suggestedName: null,
  };
}

function cancelResult(
  stage: ChapterStage,
  extracted: readonly string[],
  filtered: readonly string[],
  bible: CharacterBible | null,
): RunChapterOutput {
  return {
    status: 'cancelled',
    failedAt: stage,
    error: null,
    extractedPagesRefs: extracted,
    filteredPagesRefs: filtered,
    bible,
    chapter: null,
    zipRef: null,
    suggestedName: null,
  };
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Translate a rich pipeline event into a telemetry StageEvent for the
 * EventBus, or null for events that aren't stage boundaries (scene-level
 * narrate ticks, cancellation). The `.start` / `.done` / `.failed`
 * suffix maps to `start` / `end` / `error`; the timing collector pairs
 * start↔end per (stage, runId) to derive p50/p95.
 */
function toStageEvent(e: RunChapterStageEvent, runId: ChapterId): StageEvent | null {
  const dot = e.kind.lastIndexOf('.');
  if (dot < 0) return null;
  const stage = e.kind.slice(0, dot);
  const suffix = e.kind.slice(dot + 1);
  const phase =
    suffix === 'start' ? 'start' : suffix === 'done' ? 'end' : suffix === 'failed' ? 'error' : null;
  if (!phase) return null;
  // `stage` here is one of the ChapterStage names, all valid StageEvent stages.
  if (!STAGE_NAMES.has(stage)) return null;
  return { stage: stage as StageEvent['stage'], phase, chapterId: runId, tsMs: Date.now() };
}

const STAGE_NAMES: ReadonlySet<string> = new Set([
  'extract',
  'filter',
  'bible',
  'narrate',
  'polish',
  'structural',
  'accuracy',
  'assemble',
]);

function rand4(): string {
  return Math.random().toString(36).slice(2, 6);
}
