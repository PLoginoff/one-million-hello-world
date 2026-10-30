/**
 * AdaptiveTtlPolicy — hit-rate-driven TTL adjustment.
 *
 * Static TTLs are guesses: too short and hot keys keep re-loading;
 * too long and cold keys waste memory and serve stale data. This policy
 * observes per-key access patterns and periodically recommends a new
 * TTL per key, clamped to `[minTtlMs, maxTtlMs]`.
 *
 * Signals tracked per key (cheap counters, no event log):
 *   - `hits`     — gets that found a live entry
 *   - `misses`   — gets that found nothing (expired or absent)
 *   - `expiredHits` — gets that arrived *just after* expiry within a
 *                   grace window (`lateGraceMs`). A high count means the
 *                   TTL is too short: consumers wanted the value slightly
 *                   longer than we kept it.
 *
 * Adjustment rule (applied by `recompute(key)` every `windowMs`):
 *   Let u = hits, m = misses, l = expiredHits in the window.
 *   - l > 0 and l ≥ u      → TTL *= growFactor   (value wanted longer)
 *   - u == 0 and m > 0     → TTL *= shrinkFactor (nobody used what we cached)
 *   - u / (u + m) < minHitRate → TTL *= shrinkFactor
 *   - else                 → unchanged
 * The multiplicative step keeps adjustment smooth (no oscillation) and
 * the clamp keeps it bounded.
 *
 * New keys start at `initialTtlMs`. Keys not recomputed for
 * `staleKeyMs` are dropped from the table so the policy doesn't leak
 * memory on one-shot keys.
 *
 * Complexity: record* is O(1); recompute O(1) per key; sweep O(#keys).
 *
 * @module CacheLayer/Engine
 */

import { CacheEngineClock, SystemEngineClock } from './types';

export interface AdaptiveTtlOptions {
  /** TTL a key starts with before any data (ms). */
  initialTtlMs: number;
  /** Hard lower bound (ms). */
  minTtlMs: number;
  /** Hard upper bound (ms). */
  maxTtlMs: number;
  /** Multiplier when TTL should grow (> 1). Default 1.5. */
  growFactor?: number;
  /** Multiplier when TTL should shrink (< 1). Default 0.6. */
  shrinkFactor?: number;
  /** Hit-rate floor; below it the TTL shrinks. Default 0.2. */
  minHitRate?: number;
  /**
   * Grace window after expiry (ms) in which a get counts as an
   * "expired hit" — evidence the TTL was too short. Default 30s.
   */
  lateGraceMs?: number;
  /** Drop per-key state after this long without observation (ms). Default 1h. */
  staleKeyMs?: number;
  clock?: CacheEngineClock;
}

export interface KeyTtlDecision {
  key: string;
  previousTtlMs: number;
  newTtlMs: number;
  direction: 'grew' | 'shrank' | 'unchanged';
  hitRate: number;
  expiredHits: number;
}

interface KeySignals {
  hits: number;
  misses: number;
  expiredHits: number;
  currentTtlMs: number;
  /** Last event time for stale-key reaping. */
  lastSeenMs: number;
  /**
   * Set when an entry is written: the clock time it expires. Used to
   * tell "miss because absent" from "miss because just expired".
   */
  lastExpiryAt: number;
}

export class AdaptiveTtlPolicy {
  private readonly _clock: CacheEngineClock;
  private readonly _initialTtlMs: number;
  private readonly _minTtlMs: number;
  private readonly _maxTtlMs: number;
  private readonly _grow: number;
  private readonly _shrink: number;
  private readonly _minHitRate: number;
  private readonly _lateGraceMs: number;
  private readonly _staleKeyMs: number;

  private readonly _keys = new Map<string, KeySignals>();

  constructor(options: AdaptiveTtlOptions) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._initialTtlMs = options.initialTtlMs;
    this._minTtlMs = options.minTtlMs;
    this._maxTtlMs = options.maxTtlMs;
    this._grow = options.growFactor ?? 1.5;
    this._shrink = options.shrinkFactor ?? 0.6;
    this._minHitRate = options.minHitRate ?? 0.2;
    this._lateGraceMs = options.lateGraceMs ?? 30_000;
    this._staleKeyMs = options.staleKeyMs ?? 3_600_000;
    if (this._minTtlMs > this._maxTtlMs) {
      throw new Error('AdaptiveTtlPolicy: minTtlMs must be <= maxTtlMs');
    }
  }

  /** TTL currently recommended for `key` (initial value if unseen). */
  ttlFor(key: string): number {
    return this._keys.get(key)?.currentTtlMs ?? this._initialTtlMs;
  }

  /** Record a live-entry hit. */
  recordHit(key: string): void {
    const s = this._signals(key);
    s.hits++;
    s.lastSeenMs = this._clock.now();
  }

  /**
   * Record a miss. When the key had a recorded expiry that passed less
   * than `lateGraceMs` ago, it's counted as an `expiredHit` — evidence
   * the TTL should grow rather than shrink.
   */
  recordMiss(key: string): void {
    const s = this._signals(key);
    const now = this._clock.now();
    if (s.lastExpiryAt > 0 && now >= s.lastExpiryAt && now - s.lastExpiryAt <= this._lateGraceMs) {
      s.expiredHits++;
    } else {
      s.misses++;
    }
    s.lastSeenMs = now;
  }

  /** Record that `key` was written with `ttlMs`; sets the expiry mark. */
  recordWrite(key: string, ttlMs: number): void {
    const s = this._signals(key);
    s.lastSeenMs = this._clock.now();
    s.lastExpiryAt = ttlMs > 0 ? s.lastSeenMs + ttlMs : 0;
  }

  /**
   * Fold the accumulated window of signals into a new TTL for `key` and
   * reset its counters. Call periodically (e.g. from a timer or on
   * every Nth access). Returns the decision for observability.
   */
  recompute(key: string): KeyTtlDecision {
    const s = this._signals(key);
    const total = s.hits + s.misses + s.expiredHits;
    const hitRate = s.hits + s.misses > 0 ? s.hits / (s.hits + s.misses) : 1;

    let next = s.currentTtlMs;
    let direction: KeyTtlDecision['direction'] = 'unchanged';

    if (total > 0) {
      if (s.expiredHits > 0 && s.expiredHits >= s.hits) {
        next = s.currentTtlMs * this._grow;
        direction = 'grew';
      } else if ((s.hits === 0 && s.misses > 0) || hitRate < this._minHitRate) {
        next = s.currentTtlMs * this._shrink;
        direction = 'shrank';
      }
    }

    next = Math.round(Math.min(this._maxTtlMs, Math.max(this._minTtlMs, next)));
    if (next === s.currentTtlMs) direction = 'unchanged';

    const decision: KeyTtlDecision = {
      key,
      previousTtlMs: s.currentTtlMs,
      newTtlMs: next,
      direction,
      hitRate,
      expiredHits: s.expiredHits,
    };

    s.currentTtlMs = next;
    s.hits = 0;
    s.misses = 0;
    s.expiredHits = 0;
    s.lastSeenMs = this._clock.now();
    return decision;
  }

  /** Recompute every tracked key; returns all decisions. */
  recomputeAll(): KeyTtlDecision[] {
    const out: KeyTtlDecision[] = [];
    for (const key of this._keys.keys()) out.push(this.recompute(key));
    return out;
  }

  /** Drop keys idle longer than `staleKeyMs`; returns removed count. */
  sweepStale(): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [k, s] of this._keys) {
      if (now - s.lastSeenMs > this._staleKeyMs) {
        this._keys.delete(k);
        removed++;
      }
    }
    return removed;
  }

  /** Read-only snapshot for dashboards. */
  snapshot(): ReadonlyArray<{ key: string; ttlMs: number; hits: number; misses: number; expiredHits: number }> {
    const out: Array<{ key: string; ttlMs: number; hits: number; misses: number; expiredHits: number }> = [];
    for (const [key, s] of this._keys) {
      out.push({ key, ttlMs: s.currentTtlMs, hits: s.hits, misses: s.misses, expiredHits: s.expiredHits });
    }
    return out;
  }

  get trackedKeys(): number {
    return this._keys.size;
  }

  private _signals(key: string): KeySignals {
    let s = this._keys.get(key);
    if (!s) {
      s = {
        hits: 0,
        misses: 0,
        expiredHits: 0,
        currentTtlMs: this._initialTtlMs,
        lastSeenMs: this._clock.now(),
        lastExpiryAt: 0,
      };
      this._keys.set(key, s);
    }
    return s;
  }
}
