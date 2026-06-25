import { Injectable, inject } from '@angular/core';
import {
  BLOB_REGISTRY_PORT,
  FilterError,
  type BlobRegistryPort,
  type ExtractedPage,
  type FilterSettings,
  type FilteredPage,
  type ImageFilterPort,
} from '@mc/domain';
import type { FilteredOutPage } from 'shared-ipc';
import { requireBridge } from './bridge';
import {
  FilteredImageCacheService,
  buildFilterCacheKey,
  hashBytes,
} from '../cache/filtered-image-cache';

@Injectable({ providedIn: 'root' })
export class ImageFilterAdapter implements ImageFilterPort {
  private readonly blobs: BlobRegistryPort = inject(BLOB_REGISTRY_PORT);
  private readonly cache = inject(FilteredImageCacheService);

  async filter(
    pages: readonly ExtractedPage[],
    settings: FilterSettings,
  ): Promise<readonly FilteredPage[]> {
    const resolved = await Promise.all(
      pages.map(async (p) => {
        const bytes = await this.blobs.get(p.bytesRef);
        if (!bytes) throw new FilterError(`Bytes missing for page ${p.index}`);
        const jpegBytes = new Uint8Array(bytes);
        return { index: p.index, jpegBytes, hash: hashBytes(jpegBytes) };
      }),
    );

    const cacheKey = buildFilterCacheKey(
      resolved.map((r) => r.hash),
      settings,
    );

    let filtered = await this.cache.get(cacheKey);
    if (!filtered) {
      filtered = await this.runFilter(
        resolved.map((r) => ({ index: r.index, jpegBytes: r.jpegBytes })),
        settings,
      );
      // Fire-and-forget persist; the result is already returned to the caller.
      void this.cache.put(cacheKey, filtered);
    }

    return filtered.map((p) => {
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

  private async runFilter(
    pages: readonly { index: number; jpegBytes: Uint8Array }[],
    settings: FilterSettings,
  ): Promise<readonly FilteredOutPage[]> {
    const bridge = requireBridge();
    const collected: FilteredOutPage[] = [];
    try {
      await bridge.image.filter({ pages, settings }, (p) => collected.push(p));
    } catch (err) {
      throw new FilterError('Image filter stage failed', err);
    }
    return collected;
  }
}
