import { Injectable, inject } from '@angular/core';
import { ASSEMBLER_PORT, type Chapter, type FilteredPage } from '@mc/domain';

export interface AssembleOutputInput {
  readonly chapter: Chapter;
  readonly keptPages: readonly FilteredPage[];
}

export interface AssembleOutputOutput {
  readonly zipRef: string;
  readonly suggestedName: string;
}

@Injectable({ providedIn: 'root' })
export class AssembleOutputUseCase {
  private readonly assembler = inject(ASSEMBLER_PORT);

  async execute(input: AssembleOutputInput): Promise<AssembleOutputOutput> {
    const result = await this.assembler.buildChapterZip(input.chapter, input.keptPages);
    return { zipRef: result.zipRef, suggestedName: result.suggestedName };
  }
}
