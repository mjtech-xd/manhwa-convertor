// Image filter stage — runs on JPEG bytes coming out of the rasteriser.
// Three sub-stages:
//   1. Crop top/bottom margins (chapter-page footers/headers).
//   2. Blank-page detection (low stddev + high mean grayscale).
//   3. Perceptual-hash dedup (Hamming distance against recent kept pages).
//
// All decisions are recorded in the returned `reason` field so the
// debug panel can show why each page was kept/dropped.

import sharp from 'sharp';

export interface InPage {
  readonly index: number;
  readonly jpegBytes: Uint8Array;
}

export interface OutPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly jpegBytes: Uint8Array;
  readonly kept: boolean;
  readonly reason: string;
  readonly phash: string;          // hex; empty when not computed
}

export interface FilterSettings {
  readonly cropTopPct: number;
  readonly cropBottomPct: number;
  readonly blankStddev: number;
  readonly blankMean: number;
  readonly dedupeThreshold: number;
  readonly dedupeLookback: number;
}

export async function filterPages(
  pages: readonly InPage[],
  settings: FilterSettings,
): Promise<readonly OutPage[]> {
  const results: OutPage[] = [];
  const recentKeptHashes: string[] = [];

  for (const page of pages) {
    const cropped = await cropMargins(page.jpegBytes, settings.cropTopPct, settings.cropBottomPct);

    const stats = await blankStats(cropped.bytes);
    if (stats.stddev <= settings.blankStddev && stats.mean >= settings.blankMean) {
      results.push({
        index: page.index,
        width: cropped.width,
        height: cropped.height,
        jpegBytes: cropped.bytes,
        kept: false,
        reason: `blank (stddev=${stats.stddev.toFixed(1)}, mean=${stats.mean.toFixed(1)})`,
        phash: '',
      });
      continue;
    }

    const phash = await computePhash(cropped.bytes);

    // Compare against the last N kept hashes only — matches legacy.
    const window = recentKeptHashes.slice(-settings.dedupeLookback);
    const duplicate = window.find((h) => hammingDistance(h, phash) <= settings.dedupeThreshold);

    if (duplicate) {
      results.push({
        index: page.index,
        width: cropped.width,
        height: cropped.height,
        jpegBytes: cropped.bytes,
        kept: false,
        reason: `dup of phash=${duplicate.slice(0, 8)}…`,
        phash,
      });
      continue;
    }

    recentKeptHashes.push(phash);
    results.push({
      index: page.index,
      width: cropped.width,
      height: cropped.height,
      jpegBytes: cropped.bytes,
      kept: true,
      reason: 'kept',
      phash,
    });
  }

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function cropMargins(
  jpegBytes: Uint8Array,
  topPct: number,
  bottomPct: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  if (topPct <= 0 && bottomPct <= 0) {
    const meta = await sharp(jpegBytes).metadata();
    return { bytes: jpegBytes, width: meta.width ?? 0, height: meta.height ?? 0 };
  }
  const meta = await sharp(jpegBytes).metadata();
  const h = meta.height ?? 0;
  const w = meta.width ?? 0;
  const topPx = Math.floor(h * Math.max(0, topPct));
  const bottomPx = Math.floor(h * Math.max(0, bottomPct));
  const newH = Math.max(1, h - topPx - bottomPx);

  const out = await sharp(jpegBytes)
    .extract({ left: 0, top: topPx, width: w, height: newH })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { bytes: new Uint8Array(out), width: w, height: newH };
}

async function blankStats(jpegBytes: Uint8Array): Promise<{ stddev: number; mean: number }> {
  const stats = await sharp(jpegBytes).grayscale().stats();
  const channel = stats.channels[0];
  if (!channel) return { stddev: 0, mean: 0 };
  return { stddev: channel.stdev, mean: channel.mean };
}

/**
 * Perceptual hash (aHash variant): 8×8 grayscale, threshold at mean.
 * Cheap and good enough for "consecutive pages are visually identical"
 * which is the dedup case we care about.
 */
async function computePhash(jpegBytes: Uint8Array): Promise<string> {
  const buf = await sharp(jpegBytes)
    .grayscale()
    .resize(8, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  let sum = 0;
  for (const b of buf) sum += b;
  const avg = sum / buf.length;

  let bits = '';
  for (const b of buf) bits += b >= avg ? '1' : '0';

  // 64 bits → 16 hex chars
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  const aBig = BigInt('0x' + a);
  const bBig = BigInt('0x' + b);
  let x = aBig ^ bBig;
  let count = 0;
  while (x > 0n) {
    if (x & 1n) count++;
    x >>= 1n;
  }
  return count;
}
