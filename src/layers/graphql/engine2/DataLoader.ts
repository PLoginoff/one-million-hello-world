/**
 * DataLoader — request-scoped batching + caching to kill N+1.
 *
 * The classic GraphQL N+1: `users { posts { author { name } } }` resolves
 * N posts → N author fetches. DataLoader collapses the per-field calls
 * into one batch: resolvers call `load(id)` and get a pending promise;
 * when the current microtask yields, all queued ids dispatch as a single
 * `batchFn(keys)` call, and results fan back out to the waiters.
 *
 * Guarantees (matching the Facebook DataLoader contract):
 *
 *  - Coalescing: all loads in a single "tick" → one batch call.
 *  - Caching: repeated load(sameKey) in the loader's lifetime returns the
 *    same promise/value — DataLoader instances are *request-scoped*
 *    precisely so the cache can't serve stale data across requests.
 *  - Ordering: results must align with request order — batchFn contract
 *    is `Promise<(V|Error)[]>` indexed to the keys array.
 *  - Errors: a batchFn rejection rejects *every* waiter; a per-slot Error
 *    in the result array rejects only that load.
 *
 * Scheduling: `queueMicrotask` (not setTimeout) — batches dispatch after
 * the current synchronous resolution pass, before the event loop turns,
 * so `await load(x)` in nested resolvers still coalesces.
 *
 * Complexity: O(B) per dispatch (B = batch size); cache lookups O(1).
 *
 * @module GraphqlLayer/Engine2
 */

export type BatchFn<K, V> = (keys: readonly K[]) => Promise<readonly (V | Error)[]>;

export interface DataLoaderStats {
  /** Distinct keys requested. */
  readonly loads: number;
  /** Batch dispatches performed. */
  readonly batches: number;
  /** Loads served from the per-request cache. */
  readonly cacheHits: number;
}

export class DataLoader<K, V> {
  private readonly _batchFn: BatchFn<K, V>;
  private readonly _cache = new Map<K, Promise<V>>();
  private _queue: { key: K; resolve: (v: V) => void; reject: (e: Error) => void }[] = [];
  private _scheduled = false;
  private _loads = 0;
  private _batches = 0;
  private _cacheHits = 0;

  constructor(batchFn: BatchFn<K, V>) {
    this._batchFn = batchFn;
  }

  /** Load one key — coalesces into the next batch dispatch. */
  load(key: K): Promise<V> {
    const cached = this._cache.get(key);
    if (cached) {
      this._cacheHits++;
      return cached;
    }
    this._loads++;
    const p = new Promise<V>((resolve, reject) => {
      this._queue.push({ key, resolve, reject });
    });
    this._cache.set(key, p);
    if (!this._scheduled) {
      this._scheduled = true;
      queueMicrotask(() => this._dispatch());
    }
    return p;
  }

  /** Load many — same coalescing, one Promise.all out. */
  loadMany(keys: readonly K[]): Promise<(V | Error)[]> {
    return Promise.all(
      keys.map((k) => this.load(k).then((v) => v, (e: Error) => e))
    );
  }

  /** Pre-seed the cache — e.g. a fetched object satisfies a later load. */
  prime(key: K, value: V): void {
    if (!this._cache.has(key)) {
      this._cache.set(key, Promise.resolve(value));
    }
  }

  /** Drop one key from the cache (post-mutation invalidation). */
  clear(key: K): void {
    this._cache.delete(key);
  }

  clearAll(): void {
    this._cache.clear();
  }

  stats(): DataLoaderStats {
    return { loads: this._loads, batches: this._batches, cacheHits: this._cacheHits };
  }

  /* ---------------------------------------------------------------- */

  private async _dispatch(): Promise<void> {
    const batch = this._queue;
    this._queue = [];
    this._scheduled = false;
    if (batch.length === 0) return;

    this._batches++;
    try {
      const values = await this._batchFn(batch.map((b) => b.key));
      if (values.length !== batch.length) {
        throw new Error(
          `DataLoader batchFn returned ${values.length} results for ${batch.length} keys — must align with request order`
        );
      }
      for (let i = 0; i < batch.length; i++) {
        const v = values[i];
        if (v instanceof Error) {
          // Remove the rejected promise from cache — a retry should refetch.
          this._cache.delete(batch[i].key);
          batch[i].reject(v);
        } else {
          batch[i].resolve(v);
        }
      }
    } catch (err) {
      // Whole-batch failure: reject every waiter + evict their cache slots.
      for (const b of batch) {
        this._cache.delete(b.key);
        b.reject(err as Error);
      }
    }
  }
}
