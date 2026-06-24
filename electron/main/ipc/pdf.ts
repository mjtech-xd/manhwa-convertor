// IPC handler for `pdf:rasterise`. Validates the request, calls the
// rasteriser service, ships back a typed response.
//
// Renderer sends:  { pdfBytes: Uint8Array, maxDimPx: number }
// Renderer gets:   { pages: Array<{ index, width, height, jpegBytes: Uint8Array }> }
//
// Buffers cross the IPC via structured-clone. For a single PDF this is
// acceptable (~5–30 MB per direction). When we hit Bulk mode we'll
// switch to MessageChannelMain to avoid the clone copy.

import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  rasterisePdf,
  type RasterisedPage,
} from '../services/pdf-rasteriser.service.js';
import { runCpuTask } from '../services/worker-pool.js';

const RequestSchema = z.object({
  pdfBytes: z.instanceof(Uint8Array),
  maxDimPx: z.number().int().positive().max(8192).default(2048),
});

export function registerPdfHandlers(): void {
  ipcMain.handle('pdf:rasterise', async (_event, raw: unknown) => {
    const req = RequestSchema.parse(raw);
    // Runs in a worker thread; falls back to inline on worker load failure.
    const { pages } = await runCpuTask<{ pages: readonly RasterisedPage[] }>(
      'rasterise',
      { pdfBytes: req.pdfBytes, maxDimPx: req.maxDimPx },
      async () => ({ pages: await rasterisePdf(req.pdfBytes, { maxDimPx: req.maxDimPx }) }),
    );
    return {
      pages: pages.map((p) => ({
        index: p.index,
        width: p.width,
        height: p.height,
        jpegBytes: p.jpegBytes,
      })),
    };
  });
}
