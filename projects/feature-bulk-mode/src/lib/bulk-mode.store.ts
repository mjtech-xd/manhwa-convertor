// Bulk-mode signal store. Sequential queue of chapter PDFs that all
// share a master bible (extracted from the first chapter, then reused
// across the rest). Per-chapter execution is delegated to
// `RunChapterUseCase`; this store wires its stage events into a
// summary row per chapter.

import { inject } from '@angular/core';
import { signalStore, withMethods, withState, patchState } from '@ngrx/signals';
import {
  BLOB_REGISTRY_PORT,
  type BlobRegistryPort,
  type CharacterBible,
} from 'domain';
import { RunChapterUseCase, type RunChapterStageEvent } from 'application';

export type ChapterStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
export type ChapterStage =
  | 'extract' | 'filter' | 'bible' | 'narrate' | 'polish' | 'structural' | 'accuracy' | 'assemble';
export type QueueStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

export interface BulkChapter {
  readonly id: string;
  readonly file: File;
  readonly name: string;
  readonly status: ChapterStatus;
  readonly currentStage: ChapterStage | null;
  readonly panelsKept: number | null;
  readonly sceneCount: number | null;
  readonly scenesDone: number | null;
  readonly issueCount: number | null;
  readonly zipRef: string | null;
  readonly suggestedName: string | null;
  readonly error: string | null;
  /** True when this chapter ran with the master bible from chapter 1. */
  readonly usedMasterBible: boolean;
}

export interface BulkModeState {
  readonly chapters: readonly BulkChapter[];
  readonly status: QueueStatus;
  readonly currentIndex: number | null;
  readonly cancelRequested: boolean;
  /** Captured from the first successful bible call; reused by subsequent chapters. */
  readonly masterBible: CharacterBible | null;
}

const initial: BulkModeState = {
  chapters: [],
  status: 'idle',
  currentIndex: null,
  cancelRequested: false,
  masterBible: null,
};

export const BulkModeStore = signalStore(
  { providedIn: 'root' },
  withState<BulkModeState>(initial),
  withMethods((store) => {
    const blobs = inject(BLOB_REGISTRY_PORT) as BlobRegistryPort;
    const runChapter = inject(RunChapterUseCase);

    const patchChapterAt = (i: number, updates: Partial<BulkChapter>): void => {
      patchState(store, (state) => {
        const next = state.chapters.map((row, idx) =>
          idx === i ? { ...row, ...updates } : row,
        );
        return { chapters: next };
      });
    };

    /** Build an onStage handler scoped to a single queue row. */
    const eventHandlerFor = (i: number) => (e: RunChapterStageEvent): void => {
      switch (e.kind) {
        case 'extract.start':
          patchChapterAt(i, { currentStage: 'extract' });
          break;
        case 'filter.start':
          patchChapterAt(i, { currentStage: 'filter' });
          break;
        case 'filter.done':
          patchChapterAt(i, { panelsKept: e.pages.filter((p) => p.kept).length });
          break;
        case 'bible.start':
          patchChapterAt(i, { currentStage: 'bible' });
          break;
        case 'bible.done':
          patchChapterAt(i, { usedMasterBible: e.skipped });
          // First chapter that produced its own bible — promote it.
          if (!e.skipped && store.masterBible() === null) {
            patchState(store, { masterBible: e.bible });
          }
          break;
        case 'narrate.start':
          patchChapterAt(i, {
            currentStage: 'narrate',
            sceneCount: e.sceneCount,
            scenesDone: 0,
          });
          break;
        case 'narrate.scene-done': {
          const row = store.chapters()[i];
          if (row) patchChapterAt(i, { scenesDone: (row.scenesDone ?? 0) + 1 });
          break;
        }
        case 'polish.start':
          patchChapterAt(i, { currentStage: 'polish' });
          break;
        case 'structural.start':
          patchChapterAt(i, { currentStage: 'structural' });
          break;
        case 'accuracy.start':
          patchChapterAt(i, { currentStage: 'accuracy' });
          break;
        case 'accuracy.done':
          patchChapterAt(i, { issueCount: e.issues.length });
          break;
        case 'assemble.start':
          patchChapterAt(i, { currentStage: 'assemble' });
          break;
        // start / done events without status changes are ignored; the
        // outcome is captured via the use-case return value below.
        default:
          break;
      }
    };

    const revokeChapter = (ch: BulkChapter): void => {
      if (ch.zipRef) blobs.revoke(ch.zipRef);
    };

    return {
      add(files: readonly File[]): void {
        const pdfFiles = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
        if (pdfFiles.length === 0) return;
        const rows: BulkChapter[] = pdfFiles.map((f) => ({
          id: crypto.randomUUID(),
          file: f,
          name: f.name,
          status: 'pending',
          currentStage: null,
          panelsKept: null,
          sceneCount: null,
          scenesDone: null,
          issueCount: null,
          zipRef: null,
          suggestedName: null,
          error: null,
          usedMasterBible: false,
        }));
        patchState(store, (state) => ({ chapters: [...state.chapters, ...rows] }));
      },

      remove(id: string): void {
        if (store.status() === 'running') {
          const cur = store.currentIndex();
          const target = store.chapters().findIndex((c) => c.id === id);
          if (target === cur) return;     // never remove the running chapter
        }
        patchState(store, (state) => {
          const target = state.chapters.find((c) => c.id === id);
          if (target) revokeChapter(target);
          return { chapters: state.chapters.filter((c) => c.id !== id) };
        });
      },

      reset(): void {
        for (const c of store.chapters()) revokeChapter(c);
        patchState(store, initial);
      },

      cancel(): void {
        if (store.status() !== 'running') return;
        patchState(store, { cancelRequested: true });
      },

      async start(): Promise<void> {
        if (store.status() === 'running') return;
        if (store.chapters().length === 0) return;

        patchState(store, {
          status: 'running',
          currentIndex: null,
          cancelRequested: false,
        });

        for (let i = 0; i < store.chapters().length; i++) {
          if (store.cancelRequested()) break;
          const ch = store.chapters()[i]!;
          if (ch.status !== 'pending') continue;   // skip already-finished rows on re-start
          patchState(store, { currentIndex: i });
          patchChapterAt(i, { status: 'running', error: null });

          const bibleOverride = store.masterBible() ?? undefined;
          const result = await runChapter.execute({
            file: ch.file,
            tier: 'flash',
            bibleOverride,
            isCancelled: () => store.cancelRequested(),
            onStage: eventHandlerFor(i),
          });

          // Revoke intermediate blobs — bulk doesn't keep image grids.
          for (const ref of result.extractedPagesRefs) blobs.revoke(ref);
          for (const ref of result.filteredPagesRefs)  blobs.revoke(ref);

          switch (result.status) {
            case 'completed':
              patchChapterAt(i, {
                status: 'done',
                currentStage: null,
                zipRef: result.zipRef,
                suggestedName: result.suggestedName,
              });
              break;
            case 'failed':
              patchChapterAt(i, {
                status: 'failed',
                currentStage: result.failedAt,
                error: result.error,
              });
              break;
            case 'cancelled':
              patchChapterAt(i, {
                status: 'cancelled',
                currentStage: null,
              });
              break;
          }
        }

        const cancelled = store.cancelRequested();
        const chapters = store.chapters();
        const overall: QueueStatus = cancelled
          ? 'cancelled'
          : chapters.some((c) => c.status === 'failed')
            ? 'failed'
            : 'done';
        patchState(store, { status: overall, currentIndex: null, cancelRequested: false });
      },
    };
  }),
);
