// IPC handlers for disk-backed bulk-run checkpoints (mirror of the
// legacy electron/main.cjs behaviour). Writes JSON under
//   <userData>/checkpoints/<sessionId>/
//     meta.json            — queue snapshot + master bible
//     chapter-<index>.json — one completed chapter's script payload
//
// Bytes (images / ZIPs) are NOT persisted here — only the expensive AI
// text output. Image buffers will cross via MessageChannelMain in a
// later phase. Writes are atomic (tmp + rename) so a crash mid-write
// never corrupts an existing checkpoint.

import { ipcMain, app } from 'electron';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

const SESSION_ID = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._-]+$/);

const SaveMetaSchema = z.object({
  sessionId: SESSION_ID,
  meta: z.record(z.unknown()),
});
const LoadMetaSchema = z.object({ sessionId: SESSION_ID });
const WriteChapterSchema = z.object({
  sessionId: SESSION_ID,
  chapterIndex: z.number().int().nonnegative(),
  scriptJson: z.record(z.unknown()),
  imageBytesRefs: z.array(z.string()).default([]),
});

function checkpointsRoot(): string {
  return path.join(app.getPath('userData'), 'checkpoints');
}

/** Resolve a session dir, hard-guarding against path traversal. */
function sessionDir(sessionId: string): string {
  const root = checkpointsRoot();
  const dir = path.join(root, sessionId);
  const rel = path.relative(root, dir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Invalid sessionId: ${sessionId}`);
  }
  return dir;
}

async function writeAtomic(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, contents, 'utf8');
  await fs.rename(tmp, filePath);
}

export function registerCheckpointHandlers(): void {
  ipcMain.handle('checkpoint:save-meta', async (_e, raw: unknown) => {
    const { sessionId, meta } = SaveMetaSchema.parse(raw);
    await writeAtomic(path.join(sessionDir(sessionId), 'meta.json'), JSON.stringify(meta));
  });

  ipcMain.handle('checkpoint:load-meta', async (_e, raw: unknown) => {
    const { sessionId } = LoadMetaSchema.parse(raw);
    try {
      const text = await fs.readFile(path.join(sessionDir(sessionId), 'meta.json'), 'utf8');
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  });

  ipcMain.handle('checkpoint:write-chapter', async (_e, raw: unknown) => {
    const { sessionId, chapterIndex, scriptJson } = WriteChapterSchema.parse(raw);
    const name = `chapter-${String(chapterIndex).padStart(3, '0')}.json`;
    await writeAtomic(path.join(sessionDir(sessionId), name), JSON.stringify(scriptJson));
  });

  ipcMain.handle('checkpoint:list-sessions', async () => {
    try {
      const entries = await fs.readdir(checkpointsRoot(), { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  });

  ipcMain.handle('checkpoint:delete-session', async (_e, sessionId: unknown) => {
    const id = SESSION_ID.parse(sessionId);
    await fs.rm(sessionDir(id), { recursive: true, force: true });
  });
}
