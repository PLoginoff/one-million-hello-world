/**
 * CountingBloomFilter — probabilistic "have I seen this key?" with
 * delete support.
 *
 * A plain Bloom filter answers membership with false positives but no
 * false negatives, in O(k) time and ~1.44·log2(1/fpp) bits per element —
 * ideal as a *penetration guard* in front of a cache: ask the filter
 * "have I ever set this key?" before doing an expensive L2/DB miss.
 *
 * This variant uses 4-bit *counters* per cell (Fan et al., "Summary
 * Cache") so `delete` decrements instead of leaving stale bits — the
 * price is saturation risk past count 15 (clamped).
 *
 * Sizing: given expected `capacity` and target false-positive rate `fpp`,
 *   m = −n·ln(fpp) / (ln 2)²   cells
 *   k = (m/n)·ln 2             hash functions (optimum)
 * For n=10⁵ and fpp=1% → ~1.2MB at 4 bits/cell, k≈7.
 *
 * Hashes: k independent functions derived from two FNV-1a hashes via
 * double hashing `h_i = h1 + i·h2` (Kirsch–Mitzenmacher) — nearly as
 * good as k true hashes at a fraction of the cost.
 *
 * @module CacheLayer/Engine
 */

import { fnv1a32 } from './types';

const MAX_CELL = 15; // 4-bit counter

export class CountingBloomFilter {
  readonly cells: number;
  readonly hashCount: number;

  /** Packed 4-bit counters: byte i holds cells 2i (low nibble) & 2i+1 (high). */
  private readonly _packed: Uint8Array;
  private _count = 0;

  /**
   * @param expectedCapacity approximate distinct keys to track
   * @param falsePositiveRate target fpp at full capacity (default 0.01)
   */
  constructor(expectedCapacity = 100_000, falsePositiveRate = 0.01) {
    const n = Math.max(1, expectedCapacity);
    const fpp = Math.min(0.5, Math.max(1e-6, falsePositiveRate));
    const ln2 = Math.LN2;
    this.cells = Math.max(8, Math.ceil((-n * Math.log(fpp)) / (ln2 * ln2)));
    this.hashCount = Math.max(1, Math.round((this.cells / n) * ln2));
    this._packed = new Uint8Array(Math.ceil(this.cells / 2));
  }

  /** Cell index helpers over the packed nibbles. */
  private _getCell(i: number): number {
    const byte = this._packed[i >> 1];
    return i % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
  }
  private _setCell(i: number, v: number): void {
    const idx = i >> 1;
    const clamped = Math.min(MAX_CELL, Math.max(0, v));
    if (i % 2 === 0) {
      this._packed[idx] = (this._packed[idx] & 0xf0) | clamped;
    } else {
      this._packed[idx] = (this._packed[idx] & 0x0f) | (clamped << 4);
    }
  }

  /** k cell positions for `key` via double hashing. */
  private _positions(key: string): number[] {
    const h1 = fnv1a32(`a:${key}`);
    const h2 = fnv1a32(`b:${key}`) | 1; // odd → full cycle
    const out = new Array<number>(this.hashCount);
    for (let i = 0; i < this.hashCount; i++) {
      out[i] = Math.abs((h1 + i * h2) % this.cells);
    }
    return out;
  }

  /** Mark `key` present. */
  add(key: string): void {
    for (const i of this._positions(key)) this._setCell(i, this._getCell(i) + 1);
    this._count++;
  }

  /**
   * Mark `key` absent. Returns false when the key wasn't there (no cells
   * to decrement) — a conservative check; with false positives a "delete"
   * may decrement cells belonging to a colliding key. Acceptable for a
   * penetration guard.
   */
  delete(key: string): boolean {
    const pos = this._positions(key);
    for (const i of pos) {
      if (this._getCell(i) === 0) return false; // definitely absent
    }
    for (const i of pos) this._setCell(i, this._getCell(i) - 1);
    this._count = Math.max(0, this._count - 1);
    return true;
  }

  /** Possibly-present test; `false` is always accurate. */
  maybePresent(key: string): boolean {
    for (const i of this._positions(key)) {
      if (this._getCell(i) === 0) return false;
    }
    return true;
  }

  /** Approximate elements added (over-counted on re-add). */
  get count(): number {
    return this._count;
  }

  /**
   * Estimated current false-positive rate given items added:
   *   fpp ≈ (1 − e^(−k·n/m))^k
   */
  estimatedFpp(): number {
    const k = this.hashCount;
    const n = this._count;
    const m = this.cells;
    return Math.pow(1 - Math.exp((-k * n) / m), k);
  }

  clear(): void {
    this._packed.fill(0);
    this._count = 0;
  }
}
