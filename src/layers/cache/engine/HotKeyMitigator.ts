/**
 * HotKeyMitigator — detect skewed key access and spread its load.
 *
 * The hot-key problem: one celebrity key (`"taylor-swift:tickets"`)
 * lands on one partition via consistent hashing, and that partition
 * melts while its siblings idle. Consistent hashing spreads *keys*;
 * it cannot spread *one key's* load. Mitigation has to happen at a
 * different level:
 *
 *   1. DETECT — a CountMinSketch estimates per-key read/write rates in
 *      a rolling window. A key is hot when its estimated accesses in
 *      the window exceed `hotThreshold`. Probabilistic detection is
 *      the right trade: exact counting costs O(keys) memory forever;
 *      the sketch costs O(width×depth) regardless, and a false
 *      positive merely costs a little extra memory for split keys.
 *
 *   2. SPLIT — fan a hot key into `splitFactor` virtual sub-keys
 *      (`key#0` … `key#N-1`). Writes go to *all* sub-keys (write
 *      amplification N, which is acceptable — hot keys are read-hot;
 *      a write-hot key would want queue-based mitigation instead).
 *      Reads pick one sub-key — by caller id hash when the caller
 *      supplies one (sticky reads keep per-sub-key hit rate high) or
 *      round-robin otherwise.
 *
 *   3. REPLICATE-READ — alternative to splitting for immutable-ish hot
 *      values: the accessor keeps `readMirrors` copies keyed
 *      `key@mirror:i` and reads rotate across them. Exposed as a
 *      separate strategy because it has different consistency
 *      semantics (mirrors can briefly diverge on write).
 *
 * `HotKeyMitigator` is the detector + policy; `SplitKeyAccessor` is
 * the read/write path that wraps any `KeyValueStore`-shaped cache and
 * applies splitting transparently — callers keep using logical keys.
 *
 * Auto-cooling: hot status is recomputed per access against the
 * sketch; when a key's rate falls under `coolThreshold` for
 * `cooldownWindows` consecutive windows it's unsplit, so the
 * machinery doesn't outlive the incident.
 *
 * Complexity: record O(depth); decide O(1); split read O(1); split
 * write O(splitFactor); memory O(width×depth + splits).
 *
 * @module CacheLayer/Engine
 */

import { CountMinSketch } from './CountMinSketch';
import { CacheEngineClock, SystemEngineClock } from './types';

/* ------------------------------------------------------------------ */
/* Store contract                                                      */
/* ------------------------------------------------------------------ */

/**
 * The minimal cache surface the accessor wraps — satisfied by
 * MultiLevelCache (via a thin adapter), InMemoryBackingStore, or any
 * map-like store. Synchronous here: splitting is a routing decision,
 * not an I/O strategy.
 */
export interface KeyValueStore<T = unknown> {
  get(key: string): T | null;
  set(key: string, value: T, ttlMs?: number): void;
  delete(key: string): boolean;
}

/** Simple in-memory store fulfilling the contract (tests, demos). */
export class MapKeyValueStore<T = unknown> implements KeyValueStore<T> {
  private readonly _map = new Map<string, { value: T; expiresAt: number }>();
  private readonly _clock: CacheEngineClock;
  /** Counters so tests can verify fan-out behavior. */
  reads = 0;
  writes = 0;

  constructor(clock: CacheEngineClock = new SystemEngineClock()) {
    this._clock = clock;
  }

  get(key: string): T | null {
    this.reads++;
    const rec = this._map.get(key);
    if (!rec) return null;
    if (rec.expiresAt > 0 && this._clock.now() >= rec.expiresAt) {
      this._map.delete(key);
      return null;
    }
    return rec.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.writes++;
    const expiresAt = ttlMs !== undefined && ttlMs > 0 ? this._clock.now() + ttlMs : 0;
    this._map.set(key, { value, expiresAt });
  }

  delete(key: string): boolean {
    return this._map.delete(key);
  }

  get size(): number {
    return this._map.size;
  }

  keys(): string[] {
    return Array.from(this._map.keys());
  }
}

/* ------------------------------------------------------------------ */
/* Detector                                                            */
/* ------------------------------------------------------------------ */

export interface HotKeyOptions {
  /**
   * Accesses-per-window above which a key is declared hot. Windows are
   * `windowMs` long, rolling: the sketch is reset each window so
   * detection tracks *current* rate, not lifetime total.
   */
  readonly hotThreshold?: number;
  /**
   * Accesses-per-window below which a hot key may cool (hysteresis —
   * must be < hotThreshold or the key would flap).
   */
  readonly coolThreshold?: number;
  /** Consecutive cool windows before a key is unsplit. Default 2. */
  readonly cooldownWindows?: number;
  /** Ms per detection window. Default 10_000. */
  readonly windowMs?: number;
  /** Number of sub-keys a hot key splits into. Default 8. */
  readonly splitFactor?: number;
  /** Sketch dimensions. */
  readonly sketchWidth?: number;
  readonly sketchDepth?: number;
  readonly clock?: CacheEngineClock;
}

export interface HotKeyInfo {
  readonly key: string;
  /** Estimated accesses in the current window. */
  readonly estimate: number;
  /** Sub-key count when hot (0 when not hot). */
  readonly splitFactor: number;
  /** Windows spent under coolThreshold so far. */
  readonly coolWindows: number;
}

export interface MitigatorStats {
  readonly hotKeys: number;
  readonly windowStartedAt: number;
  readonly windowAccesses: number;
  readonly totalSplitReads: number;
  readonly totalSplitWrites: number;
  readonly totalCooled: number;
}

export class HotKeyMitigator {
  private readonly _clock: CacheEngineClock;
  private readonly _hotThreshold: number;
  private readonly _coolThreshold: number;
  private readonly _cooldownWindows: number;
  private readonly _windowMs: number;
  private readonly _splitFactor: number;
  private _sketch: CountMinSketch;

  private _windowStart: number;
  private _windowAccesses = 0;
  /** key → consecutive windows under coolThreshold. */
  private readonly _hot = new Map<string, number>();
  private _splitReads = 0;
  private _splitWrites = 0;
  private _cooled = 0;

  constructor(opts: HotKeyOptions = {}) {
    this._clock = opts.clock ?? new SystemEngineClock();
    this._hotThreshold = opts.hotThreshold ?? 1000;
    this._coolThreshold = opts.coolThreshold ?? Math.floor(this._hotThreshold / 4);
    this._cooldownWindows = Math.max(1, opts.cooldownWindows ?? 2);
    this._windowMs = Math.max(1, opts.windowMs ?? 10_000);
    this._splitFactor = Math.max(2, opts.splitFactor ?? 8);
    this._sketch = new CountMinSketch(opts.sketchWidth ?? 2048, opts.sketchDepth ?? 4);
    this._windowStart = this._clock.now();
  }

  /* ------------------------------------------------------------ */
  /* Detection                                                     */
  /* ------------------------------------------------------------ */

  /**
   * Record one access and answer: is `key` currently hot?
   * Called on every logical access — must be cheap, and is (O(depth)).
   */
  record(key: string, count = 1): boolean {
    this._rollWindow();
    const estimate = this._sketch.add(key, count);
    this._windowAccesses += count;

    if (this._hot.has(key)) {
      // Already hot: track cooling for un-splitting.
      if (estimate <= this._coolThreshold) {
        const cool = (this._hot.get(key) ?? 0) + 1;
        if (cool >= this._cooldownWindows) {
          this._hot.delete(key);
          this._cooled++;
          return false;
        }
        this._hot.set(key, cool);
      } else {
        this._hot.set(key, 0);
      }
      return this._hot.has(key);
    }

    if (estimate >= this._hotThreshold) {
      this._hot.set(key, 0);
      return true;
    }
    return false;
  }

  /** Is `key` hot right now (no recording)? */
  isHot(key: string): boolean {
    return this._hot.has(key);
  }

  /** Sub-key count for `key` — `splitFactor` when hot, else 0. */
  splitFactorFor(key: string): number {
    return this._hot.has(key) ? this._splitFactor : 0;
  }

  /** Force-mark a key hot (operator override). */
  markHot(key: string): void {
    this._hot.set(key, 0);
  }

  /** Force-unmark; split keys should be cleaned up by the accessor. */
  markCool(key: string): void {
    this._hot.delete(key);
    this._cooled++;
  }

  /** Snapshot of currently hot keys with estimates. */
  hotKeys(): HotKeyInfo[] {
    return Array.from(this._hot.entries()).map(([key, coolWindows]) => ({
      key,
      estimate: this.estimateOf(key),
      splitFactor: this._splitFactor,
      coolWindows,
    }));
  }

  /** Read-only frequency estimate (≥ true count, near it w.h.p.). */
  estimateOf(key: string): number {
    return this._sketch.estimate(key);
  }

  stats(): MitigatorStats {
    return {
      hotKeys: this._hot.size,
      windowStartedAt: this._windowStart,
      windowAccesses: this._windowAccesses,
      totalSplitReads: this._splitReads,
      totalSplitWrites: this._splitWrites,
      totalCooled: this._cooled,
    };
  }

  _noteSplitRead(): void {
    this._splitReads++;
  }

  _noteSplitWrite(): void {
    this._splitWrites++;
  }

  /**
   * Window roll: reset the sketch so counts reflect the *current*
   * window's rate.
   *
   * Cooling credit: each *fully quiet* window (one the key survived
   * with zero accesses) earns one cool credit. Only windows entirely
   * in the past count — the window we're rolling INTO is credited by
   * `record` itself after it observes the key's actual traffic, so a
   * still-hot key is never pre-credited for a window it then burns.
   */
  private _rollWindow(): void {
    const now = this._clock.now();
    const elapsed = Math.floor((now - this._windowStart) / this._windowMs);
    if (elapsed < 1) return;
    const completedQuiet = elapsed - 1;
    if (completedQuiet > 0) {
      for (const [key, cool] of this._hot) {
        const next = cool + completedQuiet;
        if (next >= this._cooldownWindows) {
          this._hot.delete(key);
          this._cooled++;
        } else {
          this._hot.set(key, next);
        }
      }
    }
    this._sketch = new CountMinSketch(this._sketch.width, this._sketch.depth);
    this._windowStart = now;
    this._windowAccesses = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Split-key accessor                                                  */
/* ------------------------------------------------------------------ */

/**
 * Transparent read/write wrapper that fans hot keys across sub-keys.
 *
 *   write hot k → sub-keys k#0..k#N-1 all written (value replicated)
 *   read  hot k → pick one sub-key (sticky by callerId or round-robin)
 *   cold key    → pass through untouched
 *
 * The accessor doesn't know *when* a key becomes hot — the mitigator
 * decides per access. A key that turns hot mid-flight will find its
 * sub-keys empty on first split read; `readThrough` optionally falls
 * back to the base key once to bridge the transition (the common case:
 * the value was written before splitting kicked in).
 */
export class SplitKeyAccessor<T> {
  private readonly _store: KeyValueStore<T>;
  private readonly _mitigator: HotKeyMitigator;
  private readonly _fallbackToBase: boolean;
  private _rr = 0;

  constructor(
    store: KeyValueStore<T>,
    mitigator: HotKeyMitigator,
    opts: { fallbackToBaseKey?: boolean } = {}
  ) {
    this._store = store;
    this._mitigator = mitigator;
    this._fallbackToBase = opts.fallbackToBaseKey ?? true;
  }

  /**
   * Logical read. `callerId` makes sub-key choice sticky per caller —
   * sticky reads keep each sub-key's local hit rate high; without one
   * we round-robin, which spreads load but dilutes per-sub-key caching
   * slightly.
   */
  get(key: string, callerId?: string): T | null {
    this._mitigator.record(key);
    const n = this._mitigator.splitFactorFor(key);
    if (n === 0) {
      return this._store.get(key);
    }
    this._mitigator._noteSplitRead();
    const sub = this._pickSubKey(key, n, callerId);
    const v = this._store.get(sub);
    if (v !== null) return v;
    return this._fallbackToBase ? this._store.get(key) : null;
  }

  /**
   * Logical write: hot → replicate to every sub-key (and the base key
   * for the transition window); cold → single write.
   */
  set(key: string, value: T, ttlMs?: number): void {
    this._mitigator.record(key);
    const n = this._mitigator.splitFactorFor(key);
    if (n === 0) {
      this._store.set(key, value, ttlMs);
      return;
    }
    this._mitigator._noteSplitWrite();
    for (let i = 0; i < n; i++) {
      this._store.set(`${key}#${i}`, value, ttlMs);
    }
    // Keep base key warm so reads issued between "went hot" and "all
    // sub-keys populated" still resolve via the fallback path.
    this._store.set(key, value, ttlMs);
  }

  /** Logical delete: base key + any extant sub-keys. */
  delete(key: string): boolean {
    const n = this._mitigator.splitFactorFor(key);
    let removed = this._store.delete(key);
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        removed = this._store.delete(`${key}#${i}`) || removed;
      }
    }
    this._mitigator.markCool(key);
    return removed;
  }

  /**
   * Sub-key selection: caller-sticky (`fnv(callerId) mod n`) or
   * round-robin. Sticky is preferred — it makes each sub-key's working
   * set stable.
   */
  private _pickSubKey(key: string, n: number, callerId?: string): string {
    let i: number;
    if (callerId !== undefined) {
      let h = 0x811c9dc5;
      const s = `${key}|${callerId}`;
      for (let c = 0; c < s.length; c++) {
        h ^= s.charCodeAt(c);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      i = h % n;
    } else {
      i = this._rr++ % n;
    }
    return `${key}#${i}`;
  }
}
