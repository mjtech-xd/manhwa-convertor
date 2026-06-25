import { z } from 'zod';
import { filterPages, type OutPage } from '../services/image-filter.service.js';
import { runCpuTask } from '../services/worker-pool.js';
import { handleStream } from './stream.js';

const SettingsSchema = z.object({
  cropTopPct: z.number().min(0).max(0.4),
  cropBottomPct: z.number().min(0).max(0.4),
  blankStddev: z.number().min(0).max(255),
  blankMean: z.number().min(0).max(255),
  dedupeThreshold: z.number().int().min(0).max(64),
  dedupeLookback: z.number().int().min(1).max(20),
});

const RequestSchema = z.object({
  pages: z.array(
    z.object({
      index: z.number().int().positive(),
      jpegBytes: z.instanceof(Uint8Array),
    }),
  ),
  settings: SettingsSchema,
});

export function registerImageHandlers(): void {
  handleStream('image:filter', async (raw, emit) => {
    const req = RequestSchema.parse(raw);
    // Runs in a worker thread; falls back to inline on worker load failure.
    const { filtered } = await runCpuTask<{ filtered: readonly OutPage[] }>(
      'filter',
      { pages: req.pages, settings: req.settings },
      async () => ({ filtered: await filterPages(req.pages, req.settings) }),
    );
    for (const p of filtered) emit(p);
  });
}
