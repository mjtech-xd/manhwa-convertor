// Single-mode signal store. Drives the page through:
//   extract → filter → bible
// One PDF at a time. State is held flat; image bytes live in the
// BlobRegistry, only refs go here.

import { inject } from '@angular/core';
import { signalStore, withMethods, withState, patchState } from '@ngrx/signals';
import {
  BLOB_REGISTRY_PORT,
  DEFAULT_FILTER_SETTINGS,
  type BlobRegistryPort,
  type CharacterBible,
  type ExtractedPage,
  type FilteredPage,
} from 'domain';
import {
  BuildBibleUseCase,
  ExtractPdfUseCase,
  FilterPagesUseCase,
} from 'application';

export type StageStatus = 'idle' | 'running' | 'done' | 'failed';

export interface SingleModeState {
  readonly fileName: string | null;
  readonly extract: { status: StageStatus; pages: readonly ExtractedPage[]; error: string | null };
  readonly filter:  { status: StageStatus; pages: readonly FilteredPage[];   error: string | null };
  readonly bible:   { status: StageStatus; value: CharacterBible | null;     error: string | null };
}

const initial: SingleModeState = {
  fileName: null,
  extract: { status: 'idle', pages: [], error: null },
  filter:  { status: 'idle', pages: [], error: null },
  bible:   { status: 'idle', value: null, error: null },
};

export const SingleModeStore = signalStore(
  { providedIn: 'root' },
  withState<SingleModeState>(initial),
  withMethods((store) => {
    const blobs = inject(BLOB_REGISTRY_PORT) as BlobRegistryPort;
    const extractUc = inject(ExtractPdfUseCase);
    const filterUc = inject(FilterPagesUseCase);
    const bibleUc = inject(BuildBibleUseCase);

    return {
      reset(): void {
        // Best-effort revoke of currently-held refs so we don't leak blob URLs.
        for (const p of store.extract.pages()) blobs.revoke(p.bytesRef);
        for (const p of store.filter.pages())  blobs.revoke(p.bytesRef);
        patchState(store, initial);
      },

      async run(file: File): Promise<void> {
        // Reset previous run.
        for (const p of store.extract.pages()) blobs.revoke(p.bytesRef);
        for (const p of store.filter.pages())  blobs.revoke(p.bytesRef);
        patchState(store, { ...initial, fileName: file.name });

        // 1. Stage PDF bytes into the registry.
        const pdfBuf = await file.arrayBuffer();
        const pdfRef = blobs.put(pdfBuf, 'application/pdf');

        // 2. Extract.
        patchState(store, { extract: { status: 'running', pages: [], error: null } });
        let extractedPages: readonly ExtractedPage[];
        try {
          const result = await extractUc.execute({ pdfBytesRef: pdfRef, sourceName: file.name });
          extractedPages = result.pages;
          patchState(store, { extract: { status: 'done', pages: extractedPages, error: null } });
        } catch (err) {
          patchState(store, {
            extract: { status: 'failed', pages: [], error: stringifyError(err) },
          });
          blobs.revoke(pdfRef);
          return;
        } finally {
          blobs.revoke(pdfRef);
        }

        // 3. Filter.
        patchState(store, { filter: { status: 'running', pages: [], error: null } });
        let filteredPages: readonly FilteredPage[];
        try {
          const result = await filterUc.execute({
            pages: extractedPages,
            settings: DEFAULT_FILTER_SETTINGS,
          });
          filteredPages = result.filtered;
          patchState(store, { filter: { status: 'done', pages: filteredPages, error: null } });
        } catch (err) {
          patchState(store, {
            filter: { status: 'failed', pages: [], error: stringifyError(err) },
          });
          return;
        }

        // 4. Bible.
        patchState(store, { bible: { status: 'running', value: null, error: null } });
        try {
          const result = await bibleUc.execute({ pages: filteredPages, tier: 'flash' });
          patchState(store, { bible: { status: 'done', value: result.bible, error: null } });
        } catch (err) {
          patchState(store, {
            bible: { status: 'failed', value: null, error: stringifyError(err) },
          });
        }
      },
    };
  }),
);

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
