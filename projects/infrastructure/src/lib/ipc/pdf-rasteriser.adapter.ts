import { Injectable, inject } from '@angular/core';
import {
  BLOB_REGISTRY_PORT,
  ExtractError,
  type BlobRegistryPort,
  type ExtractedPage,
  type PdfRasteriserPort,
} from 'domain';
import type { PdfRasteriseResponse, RasterisedPage } from 'shared-ipc';
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
    let response: PdfRasteriseResponse;
    try {
      response = (await bridge.pdf.rasterise({
        pdfBytes: new Uint8Array(bytes),
        maxDimPx: 2048,
      } as never)) as PdfRasteriseResponse;
    } catch (err) {
      throw new ExtractError('PDF rasterisation failed', err);
    }
    return response.pages.map((p: RasterisedPage) => {
      const ref = this.blobs.put(p.jpegBytes, 'image/jpeg');
      return {
        index: p.index,
        dimensions: { width: p.width, height: p.height },
        bytesRef: ref,
      };
    });
  }
}
