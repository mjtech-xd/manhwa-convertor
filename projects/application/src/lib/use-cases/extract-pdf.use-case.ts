import { Injectable, inject } from '@angular/core';
import { PDF_RASTERISER_PORT, type ExtractedPage } from 'domain';

export interface ExtractPdfInput {
  readonly pdfBytesRef: string;
  readonly sourceName: string;
}

export interface ExtractPdfOutput {
  readonly pages: readonly ExtractedPage[];
}

@Injectable({ providedIn: 'root' })
export class ExtractPdfUseCase {
  private readonly rasteriser = inject(PDF_RASTERISER_PORT);

  async execute(input: ExtractPdfInput): Promise<ExtractPdfOutput> {
    const pages = await this.rasteriser.rasterise(input.pdfBytesRef);
    return { pages };
  }
}
