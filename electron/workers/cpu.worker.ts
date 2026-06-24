// CPU worker thread entry (ADR-001).
//
// Receives { id, type, payload } from the pool, runs the matching
// service (rasterise via pdfjs+@napi-rs/canvas, or filter via sharp), and
// posts { id, ok, result } / { id, ok: false, error } back. The native
// modules (sharp, @napi-rs/canvas, pdfjs) load in THIS thread, keeping
// the main event loop free.
//
// Path note: compiled to dist-electron/workers/cpu.worker.js; the service
// imports resolve to dist-electron/main/services/* at runtime.

import { parentPort } from 'node:worker_threads';
import { rasterisePdf } from '../main/services/pdf-rasteriser.service.js';
import { filterPages } from '../main/services/image-filter.service.js';
import type {
  FilterSettings,
  InPage,
} from '../main/services/image-filter.service.js';

if (!parentPort) {
  throw new Error('cpu.worker.ts must run inside a worker thread');
}
const port = parentPort;

interface RasterisePayload {
  readonly pdfBytes: Uint8Array;
  readonly maxDimPx: number;
}
interface FilterPayload {
  readonly pages: readonly InPage[];
  readonly settings: FilterSettings;
}
interface TaskMessage {
  readonly id: number;
  readonly type: 'rasterise' | 'filter';
  readonly payload: RasterisePayload | FilterPayload;
}

port.on('message', (msg: TaskMessage) => {
  void handle(msg);
});

async function handle(msg: TaskMessage): Promise<void> {
  try {
    let result: unknown;
    if (msg.type === 'rasterise') {
      const p = msg.payload as RasterisePayload;
      const pages = await rasterisePdf(p.pdfBytes, { maxDimPx: p.maxDimPx });
      result = { pages };
    } else if (msg.type === 'filter') {
      const p = msg.payload as FilterPayload;
      const filtered = await filterPages(p.pages, p.settings);
      result = { filtered };
    } else {
      throw new Error(`Unknown CPU task type: ${(msg as { type: string }).type}`);
    }
    port.postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    port.postMessage({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
