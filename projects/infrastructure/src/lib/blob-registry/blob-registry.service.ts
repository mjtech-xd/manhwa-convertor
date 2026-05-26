// Renderer-side blob registry. Maps an internal ref (uuid) to a Blob +
// its object URL. Lets stores keep IDs (cheap, serialisable) instead of
// Blob references (heavy, non-serialisable).
//
// Always call revoke() when the underlying data is no longer needed —
// the browser will not garbage-collect blob URLs on its own.

import { Injectable } from '@angular/core';
import type { BlobRegistryPort } from 'domain';

@Injectable({ providedIn: 'root' })
export class BlobRegistryService implements BlobRegistryPort {
  private readonly store = new Map<string, { blob: Blob; url: string }>();

  put(bytes: ArrayBuffer | Uint8Array, mime: string): string {
    const ref = cryptoRandomId();
    // Copy into a fresh ArrayBuffer so the Blob owns its bytes outright.
    // Sidesteps the SharedArrayBuffer / ArrayBufferLike narrowing in
    // current lib.dom typings and avoids surprises if the caller mutates
    // the source view after we've registered the ref.
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const owned = new ArrayBuffer(src.byteLength);
    new Uint8Array(owned).set(src);
    const blob = new Blob([owned], { type: mime });
    const url = URL.createObjectURL(blob);
    this.store.set(ref, { blob, url });
    return ref;
  }

  async get(ref: string): Promise<ArrayBuffer | null> {
    const entry = this.store.get(ref);
    if (!entry) return null;
    return entry.blob.arrayBuffer();
  }

  url(ref: string): string | null {
    return this.store.get(ref)?.url ?? null;
  }

  revoke(ref: string): void {
    const entry = this.store.get(ref);
    if (!entry) return;
    URL.revokeObjectURL(entry.url);
    this.store.delete(ref);
  }
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}

