// Assembler adapter — builds the per-chapter ZIP using JSZip.
// Contents:
//   - script.txt      : raw narration (paragraph-joined)
//   - script.srt      : WPM-estimated SRT (replaced by frame-accurate
//                       output when TTS lands in a later phase)
//   - panel_NNN.jpg   : one kept-panel JPEG per paragraph
//   - manifest.json   : title + bible + counts

import { Injectable, inject } from '@angular/core';
import {
  BLOB_REGISTRY_PORT,
  type AssemblerPort,
  type BlobRegistryPort,
  type Chapter,
  type FilteredPage,
} from '@mc/domain';

const SECONDS_PER_WORD = 1 / 2.5;  // 150 wpm TTS estimate
const MIN_SECONDS_PER_LINE = 2;
const PADDING_SECONDS = 0.4;

@Injectable({ providedIn: 'root' })
export class AssemblerAdapter implements AssemblerPort {
  private readonly blobs: BlobRegistryPort = inject(BLOB_REGISTRY_PORT);

  async buildChapterZip(
    chapter: Chapter,
    keptPages: readonly FilteredPage[],
  ): Promise<{ zipRef: string; suggestedName: string }> {
    // Lazy-loaded: jszip (~90 kB, CJS) is only needed at the final assemble
    // stage, so it lives in a lazy chunk rather than the initial bundle.
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    zip.file('script.txt', chapter.script);
    zip.file('script.srt', chapter.srt ?? buildSrtFromScript(chapter.script));

    for (let i = 0; i < keptPages.length; i++) {
      const page = keptPages[i]!;
      const buf = await this.blobs.get(page.bytesRef);
      if (!buf) continue;
      const filename = `panel_${String(i + 1).padStart(3, '0')}.jpg`;
      zip.file(filename, buf);
    }

    const manifest = {
      title: chapter.title,
      sourcePdfName: chapter.sourcePdfName,
      bible: chapter.bible,
      sceneCount: chapter.scenes.length,
      panelCount: keptPages.length,
      createdAt: chapter.createdAt,
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const zipRef = this.blobs.put(bytes, 'application/zip');
    const safe = chapter.title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'chapter';
    return { zipRef, suggestedName: `${safe}.zip` };
  }
}

function buildSrtFromScript(script: string): string {
  const paragraphs = script.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (paragraphs.length === 0) return '';

  let cursor = 0;
  const blocks: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i]!;
    const words = text.split(/\s+/).length;
    const seconds = Math.max(MIN_SECONDS_PER_LINE, words * SECONDS_PER_WORD) + PADDING_SECONDS;
    const start = cursor;
    const end = cursor + seconds;
    cursor = end;
    blocks.push(`${i + 1}\n${fmt(start)} --> ${fmt(end)}\n${text}\n`);
  }
  return blocks.join('\n');
}

function fmt(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(milli, 3)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}
