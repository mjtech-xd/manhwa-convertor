import { Injectable, inject } from '@angular/core';
import { GEMINI_PORT, type CharacterBible, type ModelTier } from 'domain';

export interface StructuralEditInput {
  readonly script: string;
  readonly bible: CharacterBible;
  readonly tier: ModelTier;
}

export interface StructuralEditOutput {
  readonly edited: string;
}

@Injectable({ providedIn: 'root' })
export class StructuralEditUseCase {
  private readonly gemini = inject(GEMINI_PORT);

  async execute(input: StructuralEditInput): Promise<StructuralEditOutput> {
    const edited = await this.gemini.structuralEdit(input.script, input.bible, input.tier);
    return { edited };
  }
}
