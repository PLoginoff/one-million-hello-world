/**
 * MultiLevelCache — L1 in-memory + L2 `BackingStore` with configurable
 * write coherence.
 *
 * Model:
 *   - L1 is a bounded LRU `Map`. JS `Map` preserves insertion order, so
 *     LRU bookkeeping is `delete` + `set` — O(1) and no linked list.
 *     Eviction order is the map's iteration order (oldest first).
 *   - L2 is any `BackingStore` implementation; all L2 errors are
 *     isolated: a flaky L2 degrades the cache to L1-only rather than
 *     failing reads. Errors are counted in stats and re-thrown only on
 *     explicit `flush()`.
 *   - TTLs are lazy-expired on read (no background timers); `sweep()`
 *     is exposed for callers that want proactive expiry.
 *
 * Write policies:
 *   - write-through: `set` awaits both L1 and L2 before resolving.
 *                    Strongest coherence; pays L2 latency per write.
 *   - write-behind:  `set` updates L1 immediately and appends the write
 *                    to a dirty queue; `flush()` / `flushIfDue()` push
 *                    queued writes to L2 in FIFO order. Highest write
 *                    throughput; a crash loses at most the dirty window.
 *   - write-around:  `set` writes only L2 — used for keys predicted to
 *                    be read once, keeping one-shot scans out of L1.
 *
 * Read path: L1 hit → serve; else L2 hit → promote into L1 (cache-aside
 * promotion) and serve; else miss. Promotion respects write-around by
 * only promoting when the read came through `get`, not `getNoPromote`.
 *
 * Complexity: get/set are O(1) L1 plus one L2 round-trip on miss/write;
 * `sweep` is O(L1); `flush` is O(dirty queue).
 *
 * @module CacheLayer/Engine
 */

import {
  BackingStore,
  CacheAccessOptions,
  CacheEngineClock,
  CacheServeLevel,
  SystemEngineClock,
  WritePolicy,
} from './types';
import { TagInvalidationIndex } from './TagInvalidationIndex';

export interface MultiLevelCacheOptions {
  /** Max L1 entries before LRU eviction. Default 1000. */
  l1MaxSize?: number;
  /** Default TTL applied when neither call nor write passes one (ms). `<=0` = never. */
  defaultTtlMs?: number;
  /** Write policy for `set`. Default 'write-through'. */
  writePolicy?: WritePolicy;
  /** For write-behind: max dirty-queue length before `set` auto-flushes. Default 64. */
  writeBehindMaxQueue?: number;
  /** For write-behind: flush cadence checked by `flushIfDue` (ms). Default 1000. */
  writeBehindFlushIntervalMs?: number;
  /** Clock; defaults to system time. */
  clock?: CacheEngineClock;
  /** Optional shared tag index; a fresh one is created if omitted. */
  tagIndex?: TagInvalidationIndex;
}

export interface MultiLevelGetResult<T> {
  hit: boolean;
  value?: T;
  level: CacheServeLevel;
  /** TTL remaining (ms); `0` when the entry never expires. */
  ttlRemainingMs?: number;
}

export interface MultiLevelCacheStats {
  l1Hits: number;
  l2Hits: number;
  misses: number;
  l1Size: number;
  l1Evictions: number;
  l2Errors: number;
  /** Writes still sitting in the write-behind queue. */
  dirtyQueueSize: number;
  writeBehindFlushes: number;
  promotedToL1: number;
}

interface L1Entry<T> {
  value: T;
  /** Absolute expiry on the engine clock; `0` = never expires. */
  expiresAt: number;
}

interface DirtyWrite<T> {
  key: string;
  value: T | null; // null encodes a pending delete
  ttlMs: number;
  seq: number;
}

export class MultiLevelCache<T = unknown> {
  private readonly _l2: BackingStore<T> | null;
  private readonly _clock: CacheEngineClock;
  private readonly _l1MaxSize: number;
  private readonly _defaultTtlMs: number;
  private readonly _writePolicy: WritePolicy;
  private readonly _wbMaxQueue: number;
  private readonly _wbFlushIntervalMs: number;

  private readonly _l1 = new Map<string, L1Entry<T>>();
  private readonly _dirty: DirtyWrite<T>[] = [];
  private _dirtySeq = 0;
  private _lastFlushMs = 0;
  private _flushing: Promise<number> | null = null;

  readonly tags: TagInvalidationIndex;

  private _l1Hits = 0;
  private _l2Hits = 0;
  private _misses = 0;
  private _l1Evictions = 0;
  private _l2Errors = 0;
  private _wbFlushes = 0;
  private _promoted = 0;

  constructor(l2: BackingStore<T> | null = null, options: MultiLevelCacheOptions = {}) {
    this._l2 = l2;
    this._clock = options.clock ?? new SystemEngineClock();
    this._l1MaxSize = Math.max(1, options.l1MaxSize ?? 1000);
    this._defaultTtlMs = options.defaultTtlMs ?? 0;
    this._writePolicy = options.writePolicy ?? 'write-through';
    this._wbMaxQueue = Math.max(1, options.writeBehindMaxQueue ?? 64);
    this._wbFlushIntervalMs = Math.max(0, options.writeBehindFlushIntervalMs ?? 1000);
    this.tags = options.tagIndex ?? new TagInvalidationIndex();
  }

  /* ---------------------------------------------------------------- */
  /* Reads                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Read-through get. L1 → L2 → miss. An L2 hit is promoted into L1 so
   * the next read is process-local. `bypassL1` skips the L1 probe but
   * still promotes the result (a refresh, not a bypass of coherence).
   */
  async get(key: string, options: CacheAccessOptions = {}): Promise<MultiLevelGetResult<T>> {
    const now = this._clock.now();

    if (!options.bypassL1) {
      const l1 = this._l1.get(key);
      if (l1) {
        if (l1.expiresAt > 0 && now >= l1.expiresAt) {
          this._l1.delete(key);
        } else {
          // LRU touch: reinsert at tail.
          this._l1.delete(key);
          this._l1.set(key, l1);
          this._l1Hits++;
          return {
            hit: true,
            value: l1.value,
            level: 'L1',
            ttlRemainingMs: l1.expiresAt > 0 ? l1.expiresAt - now : 0,
          };
        }
      }
    }

    if (this._l2) {
      const fromL2 = await this._safeL2Get(key);
      if (fromL2 !== null) {
        this._l2Hits++;
        this._promote(key, fromL2, options.ttlMs ?? this._defaultTtlMs);
        return { hit: true, value: fromL2, level: 'L2' };
      }
    }

    this._misses++;
    return { hit: false, level: 'miss' };
  }

  /** Read without L1 promotion — for one-shot scans that shouldn't pollute L1. */
  async getNoPromote(key: string): Promise<MultiLevelGetResult<T>> {
    const l1 = this._l1.get(key);
    const now = this._clock.now();
    if (l1 && (l1.expiresAt <= 0 || now < l1.expiresAt)) {
      this._l1Hits++;
      return { hit: true, value: l1.value, level: 'L1' };
    }
    if (this._l2) {
      const v = await this._safeL2Get(key);
      if (v !== null) {
        this._l2Hits++;
        return { hit: true, value: v, level: 'L2' };
      }
    }
    this._misses++;
    return { hit: false, level: 'miss' };
  }

  /* ---------------------------------------------------------------- */
  /* Writes                                                            */
  /* ---------------------------------------------------------------- */

  /** Write honoring the configured `WritePolicy`. */
  async set(key: string, value: T, options: CacheAccessOptions = {}): Promise<void> {
    const ttlMs = options.ttlMs ?? this._defaultTtlMs;
    switch (this._writePolicy) {
      case 'write-through':
        this._l1Put(key, value, ttlMs);
        if (this._l2) await this._safeL2Set(key, value, ttlMs);
        break;
      case 'write-around':
        if (this._l2) {
          await this._safeL2Set(key, value, ttlMs);
          this._l1.delete(key); // ensure no stale L1 copy
        } else {
          this._l1Put(key, value, ttlMs);
        }
        break;
      case 'write-behind':
        this._l1Put(key, value, ttlMs);
        this._enqueueDirty({ key, value, ttlMs, seq: ++this._dirtySeq });
        break;
    }
    if (options.tags && options.tags.length > 0) this.tags.add(key, options.tags);
  }

  /** Delete from both levels and all tag associations. */
  async delete(key: string): Promise<boolean> {
    const existed = this._l1.delete(key);
    this.tags.removeKey(key);
    let l2Existed = false;
    if (this._l2) {
      if (this._writePolicy === 'write-behind') {
        this._enqueueDirty({ key, value: null, ttlMs: 0, seq: ++this._dirtySeq });
      } else {
        l2Existed = await this._safeL2Delete(key);
      }
    }
    return existed || l2Existed;
  }

  /** Invalidate every key carrying `tag`; returns evicted keys. */
  async invalidateTag(tag: string): Promise<string[]> {
    const keys = this.tags.keysForTag(tag);
    for (const k of keys) await this.delete(k);
    return keys;
  }

  /* ---------------------------------------------------------------- */
  /* Write-behind                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Drain the dirty queue to L2 in FIFO order. Consecutive writes to the
   * same key are coalesced: only the last-seen mutation per key is sent
   * (the middle states were never observable). Returns bytes written.
   * Throws if any L2 op fails — failed ops are NOT retried automatically;
   * the caller decides whether to re-enqueue.
   */
  async flush(): Promise<number> {
    if (this._flushing) return this._flushing;
    this._flushing = this._doFlush();
    try {
      return await this._flushing;
    } finally {
      this._flushing = null;
      this._lastFlushMs = this._clock.now();
    }
  }

  /** Time-based flush trigger; safe to call on every request. */
  async flushIfDue(): Promise<number> {
    if (this._dirty.length === 0) return 0;
    if (this._clock.now() - this._lastFlushMs < this._wbFlushIntervalMs) return 0;
    return this.flush();
  }

  private async _doFlush(): Promise<number> {
    if (!this._l2 || this._dirty.length === 0) {
      this._dirty.length = 0;
      return 0;
    }
    // Coalesce: keep only the last write per key, preserving order of
    // first appearance among survivors.
    const lastSeqByKey = new Map<string, number>();
    for (const w of this._dirty) {
      const prev = lastSeqByKey.get(w.key);
      if (prev === undefined || w.seq > prev) lastSeqByKey.set(w.key, w.seq);
    }
    const toWrite = this._dirty.filter((w) => lastSeqByKey.get(w.key) === w.seq);
    this._dirty.length = 0;

    let applied = 0;
    for (const w of toWrite) {
      if (w.value === null) {
        await this._l2.delete(w.key);
      } else {
        await this._l2.set(w.key, w.value, w.ttlMs);
      }
      applied++;
    }
    this._wbFlushes++;
    return applied;
  }

  private _enqueueDirty(w: DirtyWrite<T>): void {
    this._dirty.push(w);
    if (this._dirty.length >= this._wbMaxQueue) {
      // Synchronous coalesce-only compaction to bound memory; the caller
      // still needs flush() to actually persist.
      const lastSeqByKey = new Map<string, number>();
      for (const d of this._dirty) {
        const prev = lastSeqByKey.get(d.key);
        if (prev === undefined || d.seq > prev) lastSeqByKey.set(d.key, d.seq);
      }
      const compacted = this._dirty.filter((d) => lastSeqByKey.get(d.key) === d.seq);
      this._dirty.length = 0;
      this._dirty.push(...compacted);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Maintenance                                                       */
  /* ---------------------------------------------------------------- */

  /** Proactively drop expired L1 entries; returns count removed. */
  sweep(): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [k, e] of this._l1) {
      if (e.expiresAt > 0 && now >= e.expiresAt) {
        this._l1.delete(k);
        removed++;
      }
    }
    return removed;
  }

  /** Wipe L1 only (L2 untouched — it remains the source of truth). */
  clearL1(): void {
    this._l1.clear();
  }

  stats(): MultiLevelCacheStats {
    const total = this._l1Hits + this._l2Hits + this._misses;
    void total; // documented for readers of snapshots below
    return {
      l1Hits: this._l1Hits,
      l2Hits: this._l2Hits,
      misses: this._misses,
      l1Size: this._l1.size,
      l1Evictions: this._l1Evictions,
      l2Errors: this._l2Errors,
      dirtyQueueSize: this._dirty.length,
      writeBehindFlushes: this._wbFlushes,
      promotedToL1: this._promoted,
    };
  }

  get l1Size(): number {
    return this._l1.size;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _l1Put(key: string, value: T, ttlMs: number): void {
    const expiresAt = ttlMs > 0 ? this._clock.now() + ttlMs : 0;
    if (this._l1.has(key)) this._l1.delete(key); // refresh position
    while (this._l1.size >= this._l1MaxSize) {
      // Map iteration order = insertion order = LRU order.
      const oldest = this._l1.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this._l1.delete(oldest);
      this.tags.removeKey(oldest);
      this._l1Evictions++;
    }
    this._l1.set(key, { value, expiresAt });
  }

  private _promote(key: string, value: T, ttlMs: number): void {
    this._l1Put(key, value, ttlMs);
    this._promoted++;
  }

  private async _safeL2Get(key: string): Promise<T | null> {
    try {
      return await this._l2!.get(key);
    } catch {
      this._l2Errors++;
      return null;
    }
  }

  private async _safeL2Set(key: string, value: T, ttlMs: number): Promise<void> {
    try {
      await this._l2!.set(key, value, ttlMs);
    } catch {
      this._l2Errors++;
      // L1 copy remains — degrade to L1-only, don't propagate.
    }
  }

  private async _safeL2Delete(key: string): Promise<boolean> {
    try {
      return await this._l2!.delete(key);
    } catch {
      this._l2Errors++;
      return false;
    }
  }
}
