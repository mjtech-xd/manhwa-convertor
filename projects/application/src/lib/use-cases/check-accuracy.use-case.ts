import { Injectable, inject } from '@angular/core';
import { GEMINI_PORT, type ModelTier, type Scene } from 'domain';

export interface CheckAccuracyInput {
  readonly script: string;
  readonly scenes: readonly Scene[];
  readonly tier: ModelTier;
}

export interface CheckAccuracyOutput {
  readonly issues: readonly string[];
  readonly passed: boolean;
}

@Injectable({ providedIn: 'root' })
export class CheckAccuracyUseCase {
  private readonly gemini = inject(GEMINI_PORT);

  async execute(input: CheckAccuracyInput): Promise<CheckAccuracyOutput> {
    const { issues } = await this.gemini.checkAccuracy(input.script, input.scenes, input.tier);
    return { issues, passed: issues.length === 0 };
  }
}
