import { Injectable, inject } from '@angular/core';
import {
  BLOB_REGISTRY_PORT,
  ExtractError,
  type BlobRegistryPort,
  type ExtractedPage,
  type PdfRasteriserPort,
} from '@mc/domain';
import { requireBridge } from './bridge';

@Injectable({ providedIn: 'root' })
export class PdfRasteriserAdapter implements PdfRasteriserPort {
  private readonly blobs: BlobRegistryPort = inject(BLOB_REGISTRY_PORT);

  async rasterise(pdfBytesRef: string): Promise<readonly ExtractedPage[]> {
    const bytes = await this.blobs.get(pdfBytesRef);
    if (!bytes) {
      throw new ExtractError(`PDF bytes not found for ref ${pdfBytesRef}`);
    }
    const bridge = requireBridge();
    const pages: ExtractedPage[] = [];
    try {
      // Pages stream in one at a time; register each in the BlobRegistry
      // as it lands rather than waiting for the whole batch.
      await bridge.pdf.rasterise({ pdfBytes: new Uint8Array(bytes), maxDimPx: 2048 }, (p) => {
        const ref = this.blobs.put(p.jpegBytes, 'image/jpeg');
        pages.push({
          index: p.index,
          dimensions: { width: p.width, height: p.height },
          bytesRef: ref,
        });
      });
    } catch (err) {
      throw new ExtractError('PDF rasterisation failed', err);
    }
    return pages;
  }
}
