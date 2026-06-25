import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTER_SETTINGS, type FilterSettings } from '@mc/domain';
import { FilteredImageCacheService, buildFilterCacheKey, hashBytes } from './filtered-image-cache';

describe('hashBytes', () => {
  it('is stable for identical bytes and differs for different bytes', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    const c = new Uint8Array([1, 2, 3, 5]);
    expect(hashBytes(a)).toBe(hashBytes(b));
    expect(hashBytes(a)).not.toBe(hashBytes(c));
  });

  it('encodes the byte length, so a prefix of another hashes differently', () => {
    const short = new Uint8Array([1, 2, 3]);
    const long = new Uint8Array([1, 2, 3, 0]);
    expect(hashBytes(short)).not.toBe(hashBytes(long));
    expect(hashBytes(short).startsWith('3.')).toBe(true);
  });
});

describe('buildFilterCacheKey', () => {
  it('changes when the page order changes (dedup sequence context)', () => {
    const s = DEFAULT_FILTER_SETTINGS;
    expect(buildFilterCacheKey(['h1', 'h2'], s)).not.toBe(buildFilterCacheKey(['h2', 'h1'], s));
  });

  it('changes when any filter setting changes', () => {
    const tweaked: FilterSettings = { ...DEFAULT_FILTER_SETTINGS, dedupeThreshold: 99 };
    expect(buildFilterCacheKey(['h1'], DEFAULT_FILTER_SETTINGS)).not.toBe(
      buildFilterCacheKey(['h1'], tweaked),
    );
  });

  it('matches for the same hashes + settings', () => {
    expect(buildFilterCacheKey(['h1', 'h2'], DEFAULT_FILTER_SETTINGS)).toBe(
      buildFilterCacheKey(['h1', 'h2'], DEFAULT_FILTER_SETTINGS),
    );
  });
});

describe('FilteredImageCacheService (graceful when IndexedDB absent)', () => {
  it('returns null for an unknown key and never throws on put', async () => {
    const svc = new FilteredImageCacheService();
    expect(await svc.get('missing')).toBeNull();
    await expect(svc.put('k', [])).resolves.toBeUndefined();
  });
});
