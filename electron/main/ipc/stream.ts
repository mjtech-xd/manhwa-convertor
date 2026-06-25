// Streaming IPC transport over MessageChannelMain (CLAUDE.md §11).
//
// The renderer (via the preload) opens a MessageChannel, transfers one
// port to main alongside the request, and main streams result items back
// one at a time, terminated by a `done` or `error` message. This replaces
// the single monolithic `ipcMain.handle` response for large page payloads
// so pages arrive incrementally — the renderer registers and renders them
// as they land instead of waiting for the whole batch.
//
// Note on copies: Electron's MessagePortMain transfer list only accepts
// MessagePortMain (not ArrayBuffer), so byte payloads are still
// structured-clone copied across the process boundary — there is no
// zero-copy path under sandbox. The win here is incremental delivery and
// smaller per-message payloads, not eliminating the copy.

import { ipcMain } from 'electron';

/** Emits one streamed result item to the renderer. */
export type StreamEmit = (item: unknown) => void;

/**
 * Register a streaming handler for `channel`. `run` receives the
 * (unvalidated) request and an `emit` callback; it should validate, do
 * the work, and call `emit` once per result item. A thrown error is
 * forwarded to the renderer as a terminal `error` message.
 */
export function handleStream(
  channel: string,
  run: (req: unknown, emit: StreamEmit) => Promise<void>,
): void {
  ipcMain.on(channel, (event) => {
    const port = event.ports[0];
    if (!port) return;

    let started = false;
    port.on('message', (e) => {
      // One request per opened channel; ignore stray follow-up messages.
      if (started) return;
      started = true;

      void (async () => {
        try {
          await run(e.data, (item) => port.postMessage({ kind: 'item', item }));
          port.postMessage({ kind: 'done' });
        } catch (err) {
          port.postMessage({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          port.close();
        }
      })();
    });
    port.start();
  });
}
