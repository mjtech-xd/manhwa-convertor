// Narrow access to `window.mc` (the contextBridge surface). In Electron
// it's present; in a plain browser dev session (ng serve without
// Electron) it's not — callers must handle the absence gracefully so
// the UI still renders for layout iteration.

import type { ManhwaConvertorBridge } from 'shared-ipc';

export function getBridge(): ManhwaConvertorBridge | null {
  return typeof window !== 'undefined' && window.mc ? window.mc : null;
}

export function requireBridge(): ManhwaConvertorBridge {
  const b = getBridge();
  if (!b) {
    throw new Error(
      'Electron IPC bridge (window.mc) is not available. ' +
        'Run via `npm run electron:dev` instead of `npm run start`.',
    );
  }
  return b;
}
