// Single-mode signal store. Drives the page through:
//   extract → filter → bible → narrate → polish → structural → accuracy → assemble
// One PDF at a time. State is held flat; image bytes live in the
// BlobRegistry, only refs go here. Orchestration is delegated to
// `RunChapterUseCase`; this store just wires its stage events into
// the per-stage state shape the page renders.

import { inject } from '@angular/core';
import { signalStore, withMethods, withState, patchState } from '@ngrx/signals';
import {
  BLOB_REGISTRY_PORT,
  type BlobRegistryPort,
  type CharacterBible,
  type ExtractedPage,
  type FilteredPage,
} from 'domain';
import { RunChapterUseCase, type RunChapterStageEvent } from 'application';

export type StageStatus = 'idle' | 'running' | 'done' | 'failed';

export interface SceneRow {
  readonly id: string;
  readonly panelIndices: readonly number[];
  readonly narration: string;
  readonly status: 'pending' | 'running' | 'done' | 'failed';
  readonly error: string | null;
}

export interface SingleModeState {
  readonly fileName: string | null;
  readonly extract:    { status: StageStatus; pages: readonly ExtractedPage[]; error: string | null };
  readonly filter:     { status: StageStatus; pages: readonly FilteredPage[];   error: string | null };
  readonly bible:      { status: StageStatus; value: CharacterBible | null;     error: string | null };
  readonly narrate:    { status: StageStatus; scenes: readonly SceneRow[];      error: string | null };
  readonly polish:     { status: StageStatus; value: string | null;             error: string | null };
  readonly structural: { status: StageStatus; value: string | null;             error: string | null };
  readonly accuracy:   { status: StageStatus; issues: readonly string[];        error: string | null };
  readonly assemble:   { status: StageStatus; zipRef: string | null; suggestedName: string | null; error: string | null };
}

const initial: SingleModeState = {
  fileName: null,
  extract:    { status: 'idle', pages: [], error: null },
  filter:     { status: 'idle', pages: [], error: null },
  bible:      { status: 'idle', value: null, error: null },
  narrate:    { status: 'idle', scenes: [], error: null },
  polish:     { status: 'idle', value: null, error: null },
  structural: { status: 'idle', value: null, error: null },
  accuracy:   { status: 'idle', issues: [], error: null },
  assemble:   { status: 'idle', zipRef: null, suggestedName: null, error: null },
};

export const SingleModeStore = signalStore(
  { providedIn: 'root' },
  withState<SingleModeState>(initial),
  withMethods((store) => {
    const blobs = inject(BLOB_REGISTRY_PORT) as BlobRegistryPort;
    const runChapter = inject(RunChapterUseCase);

    const patchSceneAt = (i: number, updates: Partial<SceneRow>): void => {
      patchState(store, (state) => {
        const next = state.narrate.scenes.map((row, idx) =>
          idx === i ? { ...row, ...updates } : row,
        );
        return { narrate: { ...state.narrate, scenes: next } };
      });
    };

    const handleEvent = (e: RunChapterStageEvent): void => {
      switch (e.kind) {
        case 'extract.start':
          patchState(store, { extract: { status: 'running', pages: [], error: null } });
          break;
        case 'extract.done':
          patchState(store, { extract: { status: 'done', pages: e.pages, error: null } });
          break;
        case 'extract.failed':
          patchState(store, { extract: { status: 'failed', pages: [], error: e.error } });
          break;

        case 'filter.start':
          patchState(store, { filter: { status: 'running', pages: [], error: null } });
          break;
        case 'filter.done':
          patchState(store, { filter: { status: 'done', pages: e.pages, error: null } });
          break;
        case 'filter.failed':
          patchState(store, { filter: { status: 'failed', pages: [], error: e.error } });
          break;

        case 'bible.start':
          patchState(store, { bible: { status: 'running', value: null, error: null } });
          break;
        case 'bible.done':
          patchState(store, { bible: { status: 'done', value: e.bible, error: null } });
          break;
        case 'bible.failed':
          patchState(store, { bible: { status: 'failed', value: null, error: e.error } });
          break;

        case 'narrate.start': {
          const rows: readonly SceneRow[] = e.scenes.map((sc) => ({
            id: sc.id,
            panelIndices: sc.panelIndices,
            narration: '',
            status: 'pending',
            error: null,
          }));
          patchState(store, { narrate: { status: 'running', scenes: rows, error: null } });
          break;
        }
        case 'narrate.scene-start':
          patchSceneAt(e.index, { status: 'running' });
          break;
        case 'narrate.scene-done':
          patchSceneAt(e.index, { narration: e.narration, status: 'done' });
          break;
        case 'narrate.scene-failed':
          patchSceneAt(e.index, { status: 'failed', error: e.error });
          break;
        case 'narrate.done': {
          const status: StageStatus = e.failedCount > 0 ? 'failed' : 'done';
          const error =
            e.failedCount > 0 ? `${e.failedCount} of ${e.totalCount} scenes failed` : null;
          patchState(store, (s) => ({ narrate: { ...s.narrate, status, error } }));
          break;
        }

        case 'polish.start':
          patchState(store, { polish: { status: 'running', value: null, error: null } });
          break;
        case 'polish.done':
          patchState(store, { polish: { status: 'done', value: e.script, error: null } });
          break;
        case 'polish.failed':
          patchState(store, { polish: { status: 'failed', value: null, error: e.error } });
          break;

        case 'structural.start':
          patchState(store, { structural: { status: 'running', value: null, error: null } });
          break;
        case 'structural.done':
          patchState(store, { structural: { status: 'done', value: e.script, error: null } });
          break;
        case 'structural.failed':
          patchState(store, { structural: { status: 'failed', value: null, error: e.error } });
          break;

        case 'accuracy.start':
          patchState(store, { accuracy: { status: 'running', issues: [], error: null } });
          break;
        case 'accuracy.done':
          patchState(store, { accuracy: { status: 'done', issues: e.issues, error: null } });
          break;
        case 'accuracy.failed':
          patchState(store, { accuracy: { status: 'failed', issues: [], error: e.error } });
          break;

        case 'assemble.start':
          patchState(store, {
            assemble: { status: 'running', zipRef: null, suggestedName: null, error: null },
          });
          break;
        case 'assemble.done':
          patchState(store, {
            assemble: {
              status: 'done',
              zipRef: e.zipRef,
              suggestedName: e.suggestedName,
              error: null,
            },
          });
          break;
        case 'assemble.failed':
          patchState(store, {
            assemble: { status: 'failed', zipRef: null, suggestedName: null, error: e.error },
          });
          break;

        case 'pipeline.cancelled':
          // Single mode has no cancel UI yet — no state change needed.
          break;
      }
    };

    return {
      reset(): void {
        for (const p of store.extract.pages()) blobs.revoke(p.bytesRef);
        for (const p of store.filter.pages())  blobs.revoke(p.bytesRef);
        const zipRef = store.assemble.zipRef();
        if (zipRef) blobs.revoke(zipRef);
        patchState(store, initial);
      },

      async run(file: File): Promise<void> {
        // Reset previous run.
        for (const p of store.extract.pages()) blobs.revoke(p.bytesRef);
        for (const p of store.filter.pages())  blobs.revoke(p.bytesRef);
        const prevZip = store.assemble.zipRef();
        if (prevZip) blobs.revoke(prevZip);
        patchState(store, { ...initial, fileName: file.name });

        await runChapter.execute({
          file,
          tier: 'flash',
          onStage: handleEvent,
        });
      },
    };
  }),
);
