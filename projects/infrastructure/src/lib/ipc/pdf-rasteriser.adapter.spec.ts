import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOB_REGISTRY_PORT } from '@mc/domain';
import type { RasterisedPage } from 'shared-ipc';
import { PdfRasteriserAdapter } from './pdf-rasteriser.adapter';

interface WinWithBridge {
  mc?: unknown;
}

const RPAGE: RasterisedPage = {
  index: 1,
  width: 800,
  height: 1200,
  jpegBytes: new Uint8Array([1, 2, 3]),
};

describe('PdfRasteriserAdapter streaming', () => {
  afterEach(() => {
    delete (window as unknown as WinWithBridge).mc;
  });

  it('registers each streamed page in the BlobRegistry and returns them', async () => {
    const rasterise = vi.fn(async (_req: unknown, onPage: (p: RasterisedPage) => void) => {
      onPage(RPAGE);
      onPage({ ...RPAGE, index: 2 });
    });
    (window as unknown as WinWithBridge).mc = { pdf: { rasterise } };

    const put = vi.fn(() => 'blob-ref');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BLOB_REGISTRY_PORT,
          useValue: {
            get: async () => new Uint8Array([9, 9]).buffer,
            put,
            url: () => null,
            revoke: vi.fn(),
          },
        },
      ],
    });
    const adapter = TestBed.inject(PdfRasteriserAdapter);

    const pages = await adapter.rasterise('pdf-ref');

    expect(rasterise).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(2);
    expect(pages).toEqual([
      { index: 1, dimensions: { width: 800, height: 1200 }, bytesRef: 'blob-ref' },
      { index: 2, dimensions: { width: 800, height: 1200 }, bytesRef: 'blob-ref' },
    ]);
  });
});
