/**
 * CountMinSketch — sublinear frequency estimation (Cormode–Muthukrishnan
 * '05), plus a TinyLFU admission gate.
 *
 * Count-Min sketch answers "how many times has key K appeared in the
 * stream?" in O(depth) time and O(depth × width) memory — never exact,
 * but bounded error:
 *
 *   estimate(k) = min over d rows of count[d][h_d(k)]
 *
 * Guarantees: estimate ≥ true count (never under-counts), and with
 * probability ≥ 1−δ, estimate ≤ count + ε·N where
 *   ε = e/width,  δ = exp(−depth)
 *   → width=2048, depth=4: over-estimates by ≤ 0.13% of stream size.
 *
 * Two applications in a cache engine:
 *   1. `CountMinSketch` — raw frequency table.
 *   2. `TinyLfuAdmission` — W-TinyLFU admission policy (Caffeine):
 *      when a bounded cache is full, don't evict blindly — admit the
 *      candidate only if the sketch says it's *more frequent* than the
 *      eviction victim. Scan-resistant: a one-shot scan of cold keys
 *      can't evict a warm working set, because the candidates' estimates
 *      stay below the victims'.
 *      Includes periodic `reset` (halve all counters) so stale
 *      popularity decays — the standard "aging" pass.
 *
 * Hashing: pairwise-independent `h_i(k) = fnv1a32(k + ':' + i) % width`.
 * Not literally pairwise-independent (FNV isn't a universal family), but
 * empirically adequate; the math only needs near-uniform per-row hashing.
 *
 * @module CacheLayer/Engine
 */

import { fnv1a32 } from './types';

export class CountMinSketch {
  readonly width: number;
  readonly depth: number;

  private readonly _table: Uint32Array;
  private _total = 0;

  constructor(width = 2048, depth = 4) {
    this.width = Math.max(1, width);
    this.depth = Math.max(1, depth);
    this._table = new Uint32Array(this.width * this.depth);
  }

  /** Record one occurrence of `key`; returns the new estimate. */
  add(key: string, count = 1): number {
    let min = Number.MAX_SAFE_INTEGER;
    for (let d = 0; d < this.depth; d++) {
      const i = d * this.width + (fnv1a32(`${key}:${d}`) % this.width);
      const next = this._table[i] + count;
      this._table[i] = next;
      if (next < min) min = next;
    }
    this._total += count;
    return min;
  }

  /** Upper-bounded frequency estimate (≥ true count, near it w.h.p.). */
  estimate(key: string): number {
    let min = Number.MAX_SAFE_INTEGER;
    for (let d = 0; d < this.depth; d++) {
      const i = d * this.width + (fnv1a32(`${key}:${d}`) % this.width);
      const v = this._table[i];
      if (v < min) min = v;
      if (min === 0) break;
    }
    return min === Number.MAX_SAFE_INTEGER ? 0 : min;
  }

  /** Total items added across all keys. */
  get total(): number {
    return this._total;
  }

  /**
   * Halve every counter (aging pass). Called periodically so old
   * popularity fades and fresh hot keys can displace it.
   */
  halve(): void {
    for (let i = 0; i < this._table.length; i++) {
      this._table[i] = Math.floor(this._table[i] / 2);
    }
    this._total = Math.floor(this._total / 2);
  }

  reset(): void {
    this._table.fill(0);
    this._total = 0;
  }

  /** Theoretical ε bound at current width. */
  epsilon(): number {
    return Math.E / this.width;
  }
}

/**
 * TinyLFU admission: admit `candidate` over `victim` only when the
 * sketch estimates the candidate is at least as popular — the eviction
 * decision becomes frequency-informed instead of recency-only.
 */
export class TinyLfuAdmission {
  private readonly _sketch: CountMinSketch;
  private readonly _resetEvery: number;
  private _sinceReset = 0;

  constructor(options: { width?: number; depth?: number; resetEvery?: number } = {}) {
    this._sketch = new CountMinSketch(options.width ?? 2048, options.depth ?? 4);
    this._resetEvery = Math.max(1, options.resetEvery ?? 100_000);
  }

  /** Record an access to `key` (call on every get/set). */
  record(key: string): void {
    this._sketch.add(key);
    this._sinceReset++;
    if (this._sinceReset >= this._resetEvery) {
      this._sketch.halve();
      this._sinceReset = 0;
    }
  }

  /**
   * Should `candidate` replace `victim` in the cache?
   * Admit when candidate's frequency ≥ victim's (ties admit — a fresh
   * candidate shouldn't be penalized for arriving later).
   */
  admit(candidate: string, victim: string): boolean {
    return this._sketch.estimate(candidate) >= this._sketch.estimate(victim);
  }

  estimate(key: string): number {
    return this._sketch.estimate(key);
  }

  /** Force the aging pass now. */
  age(): void {
    this._sketch.halve();
    this._sinceReset = 0;
  }
}
