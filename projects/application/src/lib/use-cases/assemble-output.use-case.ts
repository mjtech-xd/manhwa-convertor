import { Injectable } from '@angular/core';
import type { Chapter, FilteredPage } from 'domain';

export interface AssembleOutputInput {
  readonly chapter: Chapter;
  readonly keptPages: readonly FilteredPage[];
}

export interface AssembleOutputOutput {
  readonly suggestedName: string;
  // Bytes are assembled by an infrastructure adapter (in the worker) keyed on the chapter.
  readonly artefactKey: string;
}

@Injectable({ providedIn: 'root' })
export class AssembleOutputUseCase {
  execute(input: AssembleOutputInput): AssembleOutputOutput {
    const safe = input.chapter.title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'chapter';
    return {
      suggestedName: `${safe}.zip`,
      artefactKey: `artefact:${input.chapter.id}`,
    };
  }
}
