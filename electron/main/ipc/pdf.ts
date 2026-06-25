// IPC handler for `pdf:rasterise`. Validates the request, calls the
// rasteriser service, streams pages back one at a time.
//
// Renderer sends:  { pdfBytes: Uint8Array, maxDimPx: number }
// Renderer gets:   a stream of { index, width, height, jpegBytes: Uint8Array }
//
// Pages stream over a MessageChannelMain port (see ./stream.ts) so the
// renderer registers and renders them incrementally rather than waiting
// for the whole batch in one structured-clone response.

import { z } from 'zod';
import { rasterisePdf, type RasterisedPage } from '../services/pdf-rasteriser.service.js';
import { runCpuTask } from '../services/worker-pool.js';
import { handleStream } from './stream.js';

const RequestSchema = z.object({
  pdfBytes: z.instanceof(Uint8Array),
  maxDimPx: z.number().int().positive().max(8192).default(2048),
});

export function registerPdfHandlers(): void {
  handleStream('pdf:rasterise', async (raw, emit) => {
    const req = RequestSchema.parse(raw);
    // Runs in a worker thread; falls back to inline on worker load failure.
    const { pages } = await runCpuTask<{ pages: readonly RasterisedPage[] }>(
      'rasterise',
      { pdfBytes: req.pdfBytes, maxDimPx: req.maxDimPx },
      async () => ({ pages: await rasterisePdf(req.pdfBytes, { maxDimPx: req.maxDimPx }) }),
    );
    for (const p of pages) {
      emit({ index: p.index, width: p.width, height: p.height, jpegBytes: p.jpegBytes });
    }
  });
}
