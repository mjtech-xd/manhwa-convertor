// Tiny insertion-ordered LRU. Backs the per-session Gemini
// prompt→response cache (§11): cap 200, evict least-recently-used.
// Map iteration order is insertion order, so the oldest live key is
// always the first one the iterator yields; touching a key re-inserts
// it to the back.

export class LruCache<V> {
  private readonly store = new Map<string, V>();

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new RangeError('LruCache capacity must be >= 1');
  }

  get(key: string): V | undefined {
    const value = this.store.get(key);
    if (value === undefined) return undefined;
    // Mark as most-recently-used.
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    // Re-insert so an updated key counts as freshly used.
    this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size > this.capacity) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
