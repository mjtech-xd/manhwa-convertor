import { Injectable, inject } from '@angular/core';
import { GEMINI_PORT, type CharacterBible, type FilteredPage, type ModelTier } from '@mc/domain';

export interface BuildBibleInput {
  readonly pages: readonly FilteredPage[];
  readonly tier: ModelTier;
}

export interface BuildBibleOutput {
  readonly bible: CharacterBible;
}

@Injectable({ providedIn: 'root' })
export class BuildBibleUseCase {
  private readonly gemini = inject(GEMINI_PORT);

  async execute(input: BuildBibleInput): Promise<BuildBibleOutput> {
    const refs = input.pages.filter((p) => p.kept).map((p) => p.bytesRef);
    const bible = await this.gemini.buildBible(refs, input.tier);
    return { bible };
  }
}
