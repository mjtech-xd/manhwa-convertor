import { Injectable, inject } from '@angular/core';
import { GEMINI_PORT, type CharacterBible, type ModelTier } from 'domain';

export interface PolishScriptInput {
  readonly script: string;
  readonly bible: CharacterBible;
  readonly tier: ModelTier;
}

export interface PolishScriptOutput {
  readonly polished: string;
}

@Injectable({ providedIn: 'root' })
export class PolishScriptUseCase {
  private readonly gemini = inject(GEMINI_PORT);

  async execute(input: PolishScriptInput): Promise<PolishScriptOutput> {
    const polished = await this.gemini.polishScript(input.script, input.bible, input.tier);
    return { polished };
  }
}
