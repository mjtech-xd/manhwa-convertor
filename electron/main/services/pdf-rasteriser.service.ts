// Rasterises a PDF into per-page JPEG byte buffers.
//
// Architecture note (CLAUDE.md ADR):
//   First slice (Phase 3) runs this directly on the main process.
//   When Bulk-mode lands (Phase 4) we move it to node:worker_threads
//   so multiple PDFs rasterise in parallel without UI hitches. The
//   interface here is designed worker-ready: pure-data in, pure-data out.

import { createCanvas } from '@napi-rs/canvas';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type * as Pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// ESM has no require — recreate it for require.resolve of the worker bundle.
const require = createRequire(import.meta.url);

// pdfjs-dist v5 is ESM-only. Under `module: node16` tsc preserves this
// dynamic import() natively (instead of downleveling to require()), so
// it loads the ESM build correctly from our CJS Electron main bundle.
let pdfjsPromise: Promise<typeof Pdfjs> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsPromise;
}

export interface RasterisedPage {
  readonly index: number;          // 1-based, matches user's mental model
  readonly width: number;
  readonly height: number;
  readonly jpegBytes: Uint8Array;
}

export interface RasteriseOptions {
  /** Cap on per-page max dimension in px. Protects worker memory. */
  readonly maxDimPx: number;
  /** JPEG quality 1–100. Higher = bigger files. */
  readonly jpegQuality?: number;
}

const DEFAULT_OPTIONS = {
  maxDimPx: 2048,
  jpegQuality: 85,
} as const satisfies Required<RasteriseOptions>;

/**
 * Rasterise every page of a PDF held in memory. Returns one JPEG buffer
 * per page along with its rendered dimensions.
 *
 * Throws if the input is not a valid PDF or pdfjs cannot open it.
 */
export async function rasterisePdf(
  pdfBytes: Uint8Array,
  opts: RasteriseOptions = DEFAULT_OPTIONS,
): Promise<readonly RasterisedPage[]> {
  const pdfjs = await loadPdfjs();

  // In Node we don't need a separate worker — disable to avoid lookup
  // for a non-existent worker bundle (the warning is noisy and the
  // single-threaded path is exactly what we want on main).
  // The legacy build defaults to this when GlobalWorkerOptions is empty.
  // (pdfjs v5 issues a warning if you don't set it; we silence it.)
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = path.join(
      path.dirname(require.resolve('pdfjs-dist/package.json')),
      'legacy/build/pdf.worker.mjs',
    );
  }

  const maxDim = opts.maxDimPx;
  const quality = opts.jpegQuality ?? DEFAULT_OPTIONS.jpegQuality;

  const doc = await pdfjs.getDocument({
    data: pdfBytes,
    // Locked-down rendering. pdfjs-dist v5 dropped the isEvalSupported flag
    // (eval is off by default in the Node build); useWorkerFetch / disableFontFace
    // also default to safe values when no worker is configured.
  }).promise;

  try {
    const pages: RasterisedPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      try {
        // Compute a scale that keeps the largest dimension ≤ maxDim.
        const naturalViewport = page.getViewport({ scale: 1.0 });
        const scale = Math.min(
          1.0,
          maxDim / Math.max(naturalViewport.width, naturalViewport.height),
        );
        const viewport = page.getViewport({ scale });

        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');

        await page.render({
          // pdfjs v5 expects an HTMLCanvasElement here in TS, but accepts
          // any object with width/height/getContext at runtime. The
          // @napi-rs/canvas Canvas matches that shape.
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
          // White out the background — PDFs default to transparent and
          // the legacy app's downstream filter assumed white paper.
          background: 'white',
        }).promise;

        const jpegBytes = canvas.toBuffer('image/jpeg', quality);
        pages.push({
          index: i,
          width: canvas.width,
          height: canvas.height,
          jpegBytes: new Uint8Array(jpegBytes),
        });
      } finally {
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
