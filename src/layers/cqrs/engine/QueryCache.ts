/**
 * QueryCache — per-query-type result caching with projection-driven
 * invalidation.
 *
 * The naive CQRS cache ("cache key → result, TTL T") has two holes this
 * module closes:
 *
 *   1. TTL staleness. A 30s TTL means up to 30s of wrong answers — fine
 *      for dashboards, wrong for anything a user just changed. So every
 *      entry also records the *checkpoint of the projection that feeds
 *      its model*. On read, if the projection has advanced past that
 *      checkpoint, the entry is stale regardless of TTL — the projection
 *      moved, so the result might have too.
 *
 *   2. Thundering-herd invalidation. When a projection update lands,
 *      every cached query over its model is suspect. `notifyUpdate`
 *      invalidates lazily (mark + sweep on next read) rather than
 *      eagerly scanning the whole cache — invalidation is O(1) amortized:
 *      a per-model `generation` counter is bumped, and an entry is dead
 *      if its generation < the model's current one.
 *
 * TTL is per query type because freshness is a property of the question,
 * not the data: `GetOrderStatus` wants seconds, `GetMonthlyReport` can
 * live with an hour.
 *
 * Eviction: LRU within the whole cache (a query type's hot entries
 * shouldn't evict another type's cold-but-expensive ones arbitrarily —
 * capacity is global). Map + doubly-linked list, same structure as
 * `LRUCacheStrategy` — O(1) get/set/evict.
 *
 * Time is injectable for deterministic TTL tests.
 *
 * @module CqrsLayer/Engine
 */

import { IClock, SystemClock } from '../../observability/engine/signals';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface QueryTypePolicy {
  /** Fresh TTL in ms — entry is definitely reusable within this window. */
  readonly ttlMs: number;
  /**
   * Models this query type reads. A projection update touching ANY of
   * them invalidates the entry (generation bump). Empty = never
   * invalidated by projections (pure TTL caching).
   */
  readonly models: readonly string[];
}

interface CacheEntry {
  key: string;
  queryType: string;
  value: unknown;
  /** Wall time the entry was stored (TTL basis). */
  storedAt: number;
  /**
   * model -> projection checkpoint seen at store time. On read, if the
   * projection advanced, the entry is stale: the data it was computed
   * from has moved.
   */
  checkpoints: Map<string, number>;
  /** model -> generation at store time (lazy invalidation). */
  generations: Map<string, number>;
  /** LRU linkage. */
  prev: CacheEntry | null;
  next: CacheEntry | null;
}

export type LookupOutcome = 'hit' | 'miss' | 'stale-checkpoint' | 'stale-generation' | 'expired';

export interface LookupResult {
  readonly outcome: LookupOutcome;
  readonly value?: unknown;
}

// ---------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------

export class QueryCache {
  private readonly _clock: IClock;
  private readonly _capacity: number;
  private readonly _policies = new Map<string, QueryTypePolicy>();
  /**
   * Projection feed per model: `model -> () => current checkpoint`.
   * Suppliers are queried on every cache read — cheap O(models) map gets.
   */
  private readonly _feed = new Map<string, () => number>();
  /** model -> invalidation generation (bumped by notifyUpdate). */
  private readonly _generation = new Map<string, number>();

  private readonly _entries = new Map<string, CacheEntry>();
  private _head: CacheEntry | null = null; // most-recently-used
  private _tail: CacheEntry | null = null; // least-recently-used
  private _hits = 0;
  private _misses = 0;
  private _stale = 0;
  private _expired = 0;
  private _evictions = 0;

  constructor(options: { capacity?: number; clock?: IClock } = {}) {
    this._capacity = Math.max(1, options.capacity ?? 1000);
    this._clock = options.clock ?? new SystemClock();
  }

  // --------------------------------------------------------- plumbing

  /** Declare how a query type is cached. */
  registerQueryType(type: string, policy: QueryTypePolicy): void {
    if (policy.ttlMs <= 0) throw new Error(`query type '${type}': ttlMs must be > 0`);
    this._policies.set(type, policy);
  }

  /**
   * Wire a model to its projection's checkpoint supplier — the "did the
   * data move" signal. Typically `() => store.checkpoint('projection')`.
   */
  bindModel(model: string, checkpointSupplier: () => number): void {
    this._feed.set(model, checkpointSupplier);
  }

  /**
   * A projection wrote new state for `model` — bump its generation so
   * dependent entries die lazily on next read. O(1).
   */
  notifyUpdate(model: string): void {
    this._generation.set(model, (this._generation.get(model) ?? 0) + 1);
  }

  // ------------------------------------------------------------ core

  /**
   * Look up `key` under `queryType`.
   *
   * Staleness rule (checked before TTL): if any bound model's projection
   * checkpoint moved past the checkpoint captured at store time, the
   * entry is stale — data it was computed from has changed. This is what
   * makes the cache safe for short-TTL user-facing reads.
   */
  lookup(queryType: string, key: string): LookupResult {
    const e = this._entries.get(queryType + '' + key);
    if (!e) {
      this._misses++;
      return { outcome: 'miss' };
    }

    const policy = this._policies.get(queryType);
    const now = this._clock.nowMs();

    // Generation check first — cheapest and covers explicit invalidation.
    for (const [model, gen] of e.generations) {
      const cur = this._generation.get(model) ?? 0;
      if (cur !== gen) {
        this._drop(e);
        this._stale++;
        return { outcome: 'stale-generation' };
      }
    }
    // Checkpoint staleness — projection moved since we cached.
    for (const [model, cp] of e.checkpoints) {
      const supplier = this._feed.get(model);
      if (supplier && supplier() !== cp) {
        this._drop(e);
        this._stale++;
        return { outcome: 'stale-checkpoint' };
      }
    }
    // TTL.
    if (policy && now - e.storedAt >= policy.ttlMs) {
      this._drop(e);
      this._expired++;
      return { outcome: 'expired' };
    }

    this._touch(e);
    this._hits++;
    return { outcome: 'hit', value: e.value };
  }

  /**
   * Store a result. Captures the projection checkpoints + generations of
   * every model the query type reads — the baseline against which
   * future staleness is judged.
   */
  store(queryType: string, key: string, value: unknown): void {
    const policy = this._policies.get(queryType);
    const compositeKey = queryType + '' + key;

    const existing = this._entries.get(compositeKey);
    if (existing) this._drop(existing);

    const checkpoints = new Map<string, number>();
    const generations = new Map<string, number>();
    for (const model of policy?.models ?? []) {
      const supplier = this._feed.get(model);
      if (supplier) checkpoints.set(model, supplier());
      generations.set(model, this._generation.get(model) ?? 0);
    }

    const e: CacheEntry = {
      key: compositeKey,
      queryType,
      value,
      storedAt: this._clock.nowMs(),
      checkpoints,
      generations,
      prev: null,
      next: null,
    };
    this._entries.set(compositeKey, e);
    this._pushFront(e);

    if (this._entries.size > this._capacity) this._evictTail();
  }

  /**
   * Read-through helper: lookup, and on miss compute + store + return.
   * Returns `{ value, outcome }` so callers can log cache behaviour.
   */
  getOrCompute<T>(
    queryType: string,
    key: string,
    compute: () => T
  ): { value: T; outcome: LookupOutcome } {
    const r = this.lookup(queryType, key);
    if (r.outcome === 'hit') return { value: r.value as T, outcome: 'hit' };
    const value = compute();
    this.store(queryType, key, value);
    return { value, outcome: r.outcome };
  }

  /** Drop everything derived from `model` (eager variant of notifyUpdate). */
  invalidateModel(model: string): number {
    let n = 0;
    for (const e of [...this._entries.values()]) {
      if (e.generations.has(model) || e.checkpoints.has(model)) {
        this._drop(e);
        n++;
      }
    }
    return n;
  }

  clear(): void {
    this._entries.clear();
    this._head = null;
    this._tail = null;
  }

  // --------------------------------------------------------- LRU guts

  private _pushFront(e: CacheEntry): void {
    e.prev = null;
    e.next = this._head;
    if (this._head) this._head.prev = e;
    this._head = e;
    if (!this._tail) this._tail = e;
  }

  private _unlink(e: CacheEntry): void {
    if (e.prev) e.prev.next = e.next;
    else this._head = e.next;
    if (e.next) e.next.prev = e.prev;
    else this._tail = e.prev;
    e.prev = null;
    e.next = null;
  }

  private _touch(e: CacheEntry): void {
    if (e === this._head) return;
    this._unlink(e);
    this._pushFront(e);
  }

  private _drop(e: CacheEntry): void {
    this._unlink(e);
    this._entries.delete(e.key);
  }

  private _evictTail(): void {
    if (this._tail) {
      this._drop(this._tail);
      this._evictions++;
    }
  }

  // ------------------------------------------------------------ stats

  get size(): number {
    return this._entries.size;
  }

  stats(): { hits: number; misses: number; stale: number; expired: number; evictions: number; hitRate: number } {
    const reads = this._hits + this._misses + this._stale + this._expired;
    return {
      hits: this._hits,
      misses: this._misses,
      stale: this._stale,
      expired: this._expired,
      evictions: this._evictions,
      hitRate: reads === 0 ? 0 : this._hits / reads,
    };
  }
}
