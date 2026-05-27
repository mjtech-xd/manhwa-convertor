// Checkpoint adapter — bridges CheckpointPort to the Electron
// `window.mc.checkpoint` IPC surface. In a plain browser dev session
// (`ng serve` without Electron) the bridge is absent; every method
// no-ops (or returns empty) so bulk mode still runs, just without
// disk-backed recovery.

import { Injectable } from '@angular/core';
import type {
  CheckpointChapterScript,
  CheckpointPort,
  CheckpointSessionMeta,
} from 'domain';
import { getBridge } from './bridge';

@Injectable({ providedIn: 'root' })
export class CheckpointAdapter implements CheckpointPort {
  isAvailable(): boolean {
    return getBridge() !== null;
  }

  async saveMeta(meta: CheckpointSessionMeta): Promise<void> {
    const b = getBridge();
    if (!b) return;
    await b.checkpoint.saveMeta({
      sessionId: meta.sessionId,
      meta: meta as unknown as Record<string, unknown>,
    });
  }

  async loadMeta(sessionId: string): Promise<CheckpointSessionMeta | null> {
    const b = getBridge();
    if (!b) return null;
    const raw = await b.checkpoint.loadMeta({ sessionId });
    return (raw as CheckpointSessionMeta | null) ?? null;
  }

  async writeChapter(
    sessionId: string,
    index: number,
    script: CheckpointChapterScript,
  ): Promise<void> {
    const b = getBridge();
    if (!b) return;
    await b.checkpoint.writeChapter({
      sessionId,
      chapterIndex: index,
      scriptJson: script as unknown as Record<string, unknown>,
      imageBytesRefs: [],
    });
  }

  async readChapter(sessionId: string, index: number): Promise<CheckpointChapterScript | null> {
    const b = getBridge();
    if (!b) return null;
    const raw = await b.checkpoint.readChapter({ sessionId, chapterIndex: index });
    return (raw as CheckpointChapterScript | null) ?? null;
  }

  async listSessions(): Promise<readonly string[]> {
    const b = getBridge();
    if (!b) return [];
    return b.checkpoint.listSessions();
  }

  async deleteSession(sessionId: string): Promise<void> {
    const b = getBridge();
    if (!b) return;
    await b.checkpoint.deleteSession(sessionId);
  }
}
