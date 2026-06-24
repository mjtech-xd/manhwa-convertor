import { Injectable, inject } from '@angular/core';
import { GEMINI_PORT, OPENROUTER_PORT, LLMResponseError, type CharacterBible, type ModelTier } from '@mc/domain';

export interface NarrateSceneInput {
  readonly bible: CharacterBible;
  readonly previousScript: string;
  readonly panelBytesRefs: readonly string[];
  readonly tier: ModelTier;
}

export interface NarrateSceneOutput {
  readonly narration: string;
  readonly modelUsed: string;
  readonly fellBackToOpenRouter: boolean;
}

@Injectable({ providedIn: 'root' })
export class NarrateSceneUseCase {
  private readonly gemini = inject(GEMINI_PORT);
  // OpenRouter fallback is Phase 4+ — optional so the use-case constructs
  // even when no adapter is provided. Without it, Gemini errors propagate.
  private readonly openRouter = inject(OPENROUTER_PORT, { optional: true });

  async execute(input: NarrateSceneInput): Promise<NarrateSceneOutput> {
    try {
      const r = await this.gemini.narrate(input);
      return { narration: r.narration, modelUsed: r.modelUsed, fellBackToOpenRouter: false };
    } catch (err) {
      if (!(err instanceof LLMResponseError) || !this.openRouter) throw err;
      const r = await this.openRouter.fallbackNarrate(input);
      return { narration: r.narration, modelUsed: r.modelUsed, fellBackToOpenRouter: true };
    }
  }
}
