import { Injectable, inject } from '@angular/core';
import { IMAGE_FILTER_PORT, type ExtractedPage, type FilteredPage, type FilterSettings } from 'domain';

export interface FilterPagesInput {
  readonly pages: readonly ExtractedPage[];
  readonly settings: FilterSettings;
}

export interface FilterPagesOutput {
  readonly filtered: readonly FilteredPage[];
  readonly kept: number;
  readonly dropped: number;
}

@Injectable({ providedIn: 'root' })
export class FilterPagesUseCase {
  private readonly filter = inject(IMAGE_FILTER_PORT);

  async execute(input: FilterPagesInput): Promise<FilterPagesOutput> {
    const filtered = await this.filter.filter(input.pages, input.settings);
    const kept = filtered.filter((p) => p.kept).length;
    return { filtered, kept, dropped: filtered.length - kept };
  }
}
