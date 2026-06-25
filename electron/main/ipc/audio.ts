// Electron IPC handler for audio stitching.
// Fetches per-line MP3 segments from CDN URLs (bypassing renderer CSP),
// probes their duration with ffmpeg, concatenates them with a silence
// gap using ffmpeg, builds an SRT, and returns the stitched MP3 bytes.

import { ipcMain } from 'electron';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

// ffmpeg-static ships a CJS default export; resolve via createRequire to
// stay compatible with the ESM → CJS-at-runtime compilation pipeline.
const _req = createRequire(import.meta.url);
const ffmpegPath = _req('ffmpeg-static') as string | null;

const execFileAsync = promisify(execFile);

const AI33_URL_RE = /^https:\/\/[^\s]+/i;

const RequestSchema = z.object({
  segmentUrls: z
    .array(z.string().url())
    .min(1)
    .refine((urls) => urls.every((u) => AI33_URL_RE.test(u)), {
      message: 'All segment URLs must be https',
    }),
  sentenceTexts: z.array(z.string()),
  silenceMs: z.number().int().min(0).max(5000).default(400),
});

export function registerAudioHandlers(): void {
  ipcMain.handle('audio:stitch', async (_event, raw: unknown) => {
    const req = RequestSchema.parse(raw);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-audio-'));
    try {
      return await stitchSegments(tmpDir, req.segmentUrls, req.sentenceTexts, req.silenceMs);
    } finally {
      // Best-effort temp cleanup; ignore failure (dir may already be gone).
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

async function stitchSegments(
  tmpDir: string,
  urls: readonly string[],
  texts: readonly string[],
  silenceMs: number,
): Promise<{ mp3Bytes: Uint8Array; durationSec: number; srt: string }> {
  const ffmpeg: string = ffmpegPath ?? 'ffmpeg';

  // Fetch + write each segment to a temp file.
  const segFiles: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]!);
    if (!res.ok) throw new Error(`Failed to fetch audio segment ${i} (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();
    const p = path.join(tmpDir, `seg_${i}.mp3`);
    await fs.writeFile(p, new Uint8Array(buf));
    segFiles.push(p);
  }

  // Get per-segment durations.
  const durationsMs = await Promise.all(segFiles.map((f) => getMp3DurationMs(f, ffmpeg)));

  // Generate silence segment (re-used between every pair of lines).
  let silenceFile: string | null = null;
  if (silenceMs > 0 && segFiles.length > 1) {
    silenceFile = path.join(tmpDir, 'silence.mp3');
    await execFileAsync(ffmpeg, [
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=44100:cl=stereo`,
      '-t',
      (silenceMs / 1000).toFixed(4),
      '-acodec',
      'libmp3lame',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-b:a',
      '128k',
      '-y',
      silenceFile,
    ]);
  }

  // Build a concat list for ffmpeg.
  const concatFile = path.join(tmpDir, 'concat.txt');
  const lines: string[] = [];
  const esc = (p: string) => p.replace(/'/g, "'\\''");
  for (let i = 0; i < segFiles.length; i++) {
    lines.push(`file '${esc(segFiles[i]!)}'`);
    if (silenceFile && i < segFiles.length - 1) {
      lines.push(`file '${esc(silenceFile)}'`);
    }
  }
  await fs.writeFile(concatFile, lines.join('\n'), 'utf8');

  // Concatenate with the concat demuxer (stream copy; no re-encode).
  const outputFile = path.join(tmpDir, 'output.mp3');
  await execFileAsync(ffmpeg, [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatFile,
    '-c',
    'copy',
    '-y',
    outputFile,
  ]);

  const mp3Bytes = new Uint8Array(await fs.readFile(outputFile));
  const totalMs =
    durationsMs.reduce((a, b) => a + b, 0) + silenceMs * Math.max(0, segFiles.length - 1);

  return {
    mp3Bytes,
    durationSec: totalMs / 1000,
    srt: buildSrt(texts, durationsMs, silenceMs),
  };
}

async function getMp3DurationMs(filePath: string, ffmpegBin: string): Promise<number> {
  // ffmpeg prints duration to stderr when given a null output.
  // The process exits with non-zero, so we catch and parse stderr.
  try {
    await execFileAsync(ffmpegBin, ['-i', filePath, '-f', 'null', '-']);
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string })?.stderr ?? '';
    const m = /Duration:\s+(\d+):(\d+):(\d+)\.(\d+)/.exec(stderr);
    if (m) {
      const h = parseInt(m[1]!);
      const min = parseInt(m[2]!);
      const s = parseInt(m[3]!);
      // m[4] is fractional seconds (variable digits); normalise to 3 decimal places.
      const fracMs = Math.round(parseFloat(`0.${m[4]!}`) * 1000);
      return h * 3_600_000 + min * 60_000 + s * 1000 + fracMs;
    }
  }
  // CBR 128kbps fallback: bytes / (128000/8) * 1000.
  const st = await fs.stat(filePath);
  return Math.round((st.size / 16_000) * 1000);
}

function buildSrt(
  texts: readonly string[],
  durationsMs: readonly number[],
  silenceMs: number,
): string {
  if (texts.length === 0) return '';
  const blocks: string[] = [];
  let cursor = 0;
  for (let i = 0; i < texts.length; i++) {
    const dur = Math.max(500, durationsMs[i] ?? 1000);
    const start = cursor;
    // Extend subtitle through the silence gap so captions stay on screen.
    const end = start + dur + (i < texts.length - 1 ? silenceMs : 0);
    blocks.push(`${i + 1}\n${srtTs(start)} --> ${srtTs(end)}\n${texts[i]!}\n`);
    cursor += dur + silenceMs;
  }
  return blocks.join('\n');
}

function srtTs(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const r = t % 1000;
  const p2 = (n: number) => String(n).padStart(2, '0');
  const p3 = (n: number) => String(n).padStart(3, '0');
  return `${p2(h)}:${p2(m)}:${p2(s)},${p3(r)}`;
}
