import { describe, expect, it } from 'vitest';
import { LruCache } from './lru-cache';

describe('LruCache', () => {
  it('returns undefined for a missing key and stores/reads values', () => {
    const cache = new LruCache<number>(3);
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('evicts the least-recently-used key past capacity', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // evicts 'a' (oldest)
    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('treats a read as recent use, sparing the touched key from eviction', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' now most-recent; 'b' is the eviction target
    cache.set('c', 3); // evicts 'b'
    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('overwrites an existing key without growing and refreshes its recency', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10); // update + refresh recency, so 'b' is now oldest
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(10);
    cache.set('c', 3); // evicts 'b'
    expect(cache.has('b')).toBe(false);
  });

  it('clear() empties the cache', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('rejects a capacity below 1', () => {
    expect(() => new LruCache<number>(0)).toThrow(RangeError);
  });
});
