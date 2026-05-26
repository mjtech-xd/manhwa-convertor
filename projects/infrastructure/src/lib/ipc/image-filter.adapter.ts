import { Injectable, inject } from '@angular/core';
import {
  BLOB_REGISTRY_PORT,
  FilterError,
  type BlobRegistryPort,
  type ExtractedPage,
  type FilterSettings,
  type FilteredPage,
  type ImageFilterPort,
} from 'domain';
import type { FilteredOutPage, ImageFilterResponse } from 'shared-ipc';
import { requireBridge } from './bridge';

@Injectable({ providedIn: 'root' })
export class ImageFilterAdapter implements ImageFilterPort {
  private readonly blobs: BlobRegistryPort = inject(BLOB_REGISTRY_PORT);

  async filter(
    pages: readonly ExtractedPage[],
    settings: FilterSettings,
  ): Promise<readonly FilteredPage[]> {
    const resolved = await Promise.all(
      pages.map(async (p) => {
        const bytes = await this.blobs.get(p.bytesRef);
        if (!bytes) throw new FilterError(`Bytes missing for page ${p.index}`);
        return { index: p.index, jpegBytes: new Uint8Array(bytes) };
      }),
    );

    const bridge = requireBridge();
    let response: ImageFilterResponse;
    try {
      response = (await bridge.image.filter({ pages: resolved, settings } as never)) as ImageFilterResponse;
    } catch (err) {
      throw new FilterError('Image filter stage failed', err);
    }

    return response.filtered.map((p: FilteredOutPage) => {
      const ref = this.blobs.put(p.jpegBytes, 'image/jpeg');
      return {
        index: p.index,
        dimensions: { width: p.width, height: p.height },
        bytesRef: ref,
        kept: p.kept,
        reason: p.reason,
        phash: p.phash,
      };
    });
  }
}
