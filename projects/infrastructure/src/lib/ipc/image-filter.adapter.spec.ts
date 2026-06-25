import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOB_REGISTRY_PORT, DEFAULT_FILTER_SETTINGS, type ExtractedPage } from '@mc/domain';
import type { FilteredOutPage } from 'shared-ipc';
import { ImageFilterAdapter } from './image-filter.adapter';
import { FilteredImageCacheService } from '../cache/filtered-image-cache';

const PAGE: ExtractedPage = {
  index: 1,
  dimensions: { width: 100, height: 200 },
  bytesRef: 'src-1',
};

const OUT: FilteredOutPage = {
  index: 1,
  width: 100,
  height: 180,
  jpegBytes: new Uint8Array([9, 9, 9]),
  kept: true,
  reason: 'kept',
  phash: 'abcd',
};

function blobsFake() {
  return {
    get: vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer),
    put: vi.fn(() => 'ref-1'),
    url: () => null,
    revoke: vi.fn(),
  };
}

interface WinWithBridge {
  mc?: unknown;
}

describe('ImageFilterAdapter caching', () => {
  afterEach(() => {
    delete (window as unknown as WinWithBridge).mc;
  });

  function setup(cache: Partial<FilteredImageCacheService>) {
    TestBed.configureTestingModule({
      providers: [
        { provide: BLOB_REGISTRY_PORT, useValue: blobsFake() },
        { provide: FilteredImageCacheService, useValue: cache },
      ],
    });
    return TestBed.inject(ImageFilterAdapter);
  }

  it('serves a cache hit without invoking the IPC bridge', async () => {
    const put = vi.fn(async () => undefined);
    // window.mc is unset: if the adapter touched the bridge it would throw.
    const adapter = setup({ get: async () => [OUT], put });

    const result = await adapter.filter([PAGE], DEFAULT_FILTER_SETTINGS);

    expect(result).toEqual([
      {
        index: 1,
        dimensions: { width: 100, height: 180 },
        bytesRef: 'ref-1',
        kept: true,
        reason: 'kept',
        phash: 'abcd',
      },
    ]);
    expect(put).not.toHaveBeenCalled();
  });

  it('calls the bridge and persists the result on a miss', async () => {
    const filter = vi.fn(async (_req: unknown, onPage: (p: FilteredOutPage) => void) => {
      onPage(OUT);
    });
    (window as unknown as WinWithBridge).mc = { image: { filter } };
    const put = vi.fn(async () => undefined);
    const adapter = setup({ get: async () => null, put });

    const result = await adapter.filter([PAGE], DEFAULT_FILTER_SETTINGS);

    expect(filter).toHaveBeenCalledTimes(1);
    expect(result[0]?.dimensions).toEqual({ width: 100, height: 180 });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(expect.any(String), [OUT]);
  });
});
