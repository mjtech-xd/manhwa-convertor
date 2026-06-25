// IndexedDB cache for filtered page output (§11). Keyed on the ordered
// source-byte hashes + the filter-settings hash, so a hit means the
// exact same pages in the exact same order were filtered with the same
// settings — which guarantees the sequence-dependent dedup decisions
// (`kept`/`reason`) are reproduced faithfully. That is the resume/retry
// path: re-running an identical chapter skips the whole rasterise→sharp
// round-trip.
//
// The store is best-effort. If IndexedDB is unavailable (jsdom tests) or
// any operation fails, every method degrades to a no-op so filtering
// still works uncached — same graceful-absence contract the IPC adapters
// follow when `window.mc` is missing.

import { Injectable } from '@angular/core';
import type { FilterSettings } from '@mc/domain';
import type { FilteredOutPage } from 'shared-ipc';

const DB_NAME = 'mc-cache';
const DB_VERSION = 1;
const STORE = 'filtered-images';

@Injectable({ providedIn: 'root' })
export class FilteredImageCacheService {
  private dbPromise: Promise<IDBDatabase | null> | undefined;

  async get(key: string): Promise<readonly FilteredOutPage[] | null> {
    const db = await this.db();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result as FilteredOutPage[] | undefined) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        // Best-effort cache: a read failure just means "miss".
        resolve(null);
      }
    });
  }

  async put(key: string, pages: readonly FilteredOutPage[]): Promise<void> {
    const db = await this.db();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(pages as FilteredOutPage[], key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        // Best-effort cache: a write failure is non-fatal.
        resolve();
      }
    });
  }

  private db(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      const idb = typeof indexedDB !== 'undefined' ? indexedDB : undefined;
      if (!idb) return resolve(null);
      try {
        const req = idb.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }
}

/**
 * Cache key for one filter batch: settings hash + the ordered list of
 * per-page source-byte hashes. Order matters — it encodes the dedup
 * sequence context, so reordered pages produce a different key.
 */
export function buildFilterCacheKey(
  sourceHashes: readonly string[],
  settings: FilterSettings,
): string {
  return `flt-v1:${hashSettings(settings)}:${sourceHashes.join('|')}`;
}

/** Per-page content hash: length plus two independent rolling hashes. */
export function hashBytes(bytes: Uint8Array): string {
  let fnv = 0x811c9dc5;
  let sdbm = 0;
  for (const b of bytes) {
    fnv = Math.imul(fnv ^ b, 0x01000193);
    sdbm = (Math.imul(sdbm, 65599) + b) | 0;
  }
  return `${bytes.length}.${(fnv >>> 0).toString(36)}.${(sdbm >>> 0).toString(36)}`;
}

function hashSettings(s: FilterSettings): string {
  return [
    s.cropTopPct,
    s.cropBottomPct,
    s.blankStddev,
    s.blankMean,
    s.dedupeThreshold,
    s.dedupeLookback,
  ].join(',');
}
