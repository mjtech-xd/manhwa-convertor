// Bulk-mode signal store. Sequential queue of chapter PDFs that all
// share a master bible (extracted from the first chapter, then reused
// across the rest). Per-chapter execution is delegated to
// `RunChapterUseCase`; this store wires its stage events into a
// summary row per chapter.

import { inject } from '@angular/core';
import { signalStore, withMethods, withState, patchState } from '@ngrx/signals';
import {
  BLOB_REGISTRY_PORT,
  CHECKPOINT_PORT,
  type BlobRegistryPort,
  type CharacterBible,
  type CheckpointPort,
  type CheckpointSessionMeta,
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
  /** Disk-checkpoint session id for the active run (null when idle). */
  readonly sessionId: string | null;
  readonly sessionCreatedAt: string | null;
  /** An interrupted run found on disk at launch — surfaced for recovery. */
  readonly recoverable: CheckpointSessionMeta | null;
}

const initial: BulkModeState = {
  chapters: [],
  status: 'idle',
  currentIndex: null,
  cancelRequested: false,
  masterBible: null,
  sessionId: null,
  sessionCreatedAt: null,
  recoverable: null,
};

export const BulkModeStore = signalStore(
  { providedIn: 'root' },
  withState<BulkModeState>(initial),
  withMethods((store) => {
    const blobs = inject(BLOB_REGISTRY_PORT) as BlobRegistryPort;
    const runChapter = inject(RunChapterUseCase);
    const checkpoint: CheckpointPort = inject(CHECKPOINT_PORT);

    const patchChapterAt = (i: number, updates: Partial<BulkChapter>): void => {
      patchState(store, (state) => {
        const next = state.chapters.map((row, idx) =>
          idx === i ? { ...row, ...updates } : row,
        );
        return { chapters: next };
      });
    };

    /** Persist a snapshot of the queue to disk. Best-effort — a failed
     *  checkpoint write never aborts the run. No-ops outside Electron. */
    const saveMeta = async (status: CheckpointSessionMeta['status']): Promise<void> => {
      const sessionId = store.sessionId();
      if (!sessionId || !checkpoint.isAvailable()) return;
      try {
        await checkpoint.saveMeta({
          sessionId,
          createdAt: store.sessionCreatedAt() ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status,
          masterBible: store.masterBible(),
          chapters: store.chapters().map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            hasScript: c.status === 'done',
          })),
        });
      } catch {
        // Disk hiccup — keep running; recovery just won't reflect this tick.
      }
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

      async checkForInterruptedSession(): Promise<void> {
        if (!checkpoint.isAvailable()) return;
        if (store.status() === 'running' || store.recoverable()) return;
        let ids: readonly string[];
        try {
          ids = await checkpoint.listSessions();
        } catch {
          return;
        }
        // Most-recent-first: session ids are timestamp-prefixed.
        for (const id of [...ids].sort().reverse()) {
          const meta = await checkpoint.loadMeta(id);
          if (meta && meta.status === 'running') {
            patchState(store, { recoverable: meta });
            return;
          }
        }
      },

      async discardRecovery(): Promise<void> {
        const rec = store.recoverable();
        if (rec) {
          try {
            await checkpoint.deleteSession(rec.sessionId);
          } catch {
            // Best-effort — clear the banner regardless.
          }
        }
        patchState(store, { recoverable: null });
      },

      async start(): Promise<void> {
        if (store.status() === 'running') return;
        if (store.chapters().length === 0) return;

        // Fresh checkpoint session for this run.
        const sessionId = `bulk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        patchState(store, {
          status: 'running',
          currentIndex: null,
          cancelRequested: false,
          sessionId,
          sessionCreatedAt: new Date().toISOString(),
          recoverable: null,
        });
        await saveMeta('running');

        for (let i = 0; i < store.chapters().length; i++) {
          if (store.cancelRequested()) break;
          const ch = store.chapters()[i]!;
          if (ch.status !== 'pending') continue;   // skip already-finished rows on re-start
          patchState(store, { currentIndex: i });
          patchChapterAt(i, { status: 'running', error: null });
          await saveMeta('running');

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
              // Persist the chapter's recoverable text payload.
              if (result.chapter) {
                try {
                  await checkpoint.writeChapter(sessionId, i, {
                    index: i,
                    name: ch.name,
                    script: result.chapter.script,
                    bible: result.chapter.bible,
                  });
                } catch {
                  // Non-fatal — meta still records the chapter as done.
                }
              }
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
          await saveMeta('running');
        }

        const cancelled = store.cancelRequested();
        const chapters = store.chapters();
        const overall: QueueStatus = cancelled
          ? 'cancelled'
          : chapters.some((c) => c.status === 'failed')
            ? 'failed'
            : 'done';
        patchState(store, { status: overall, currentIndex: null, cancelRequested: false });
        await saveMeta(overall);
      },
    };
  }),
);
