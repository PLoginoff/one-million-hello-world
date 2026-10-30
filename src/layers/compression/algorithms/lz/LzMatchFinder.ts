/**
 * LzMatchFinder — hash-chain match finder for LZ77/LZSS.
 *
 * This is the same technique used in zlib: a hash table maps each 3-byte
 * sequence to the most recent position where it occurred; each position
 * also links to the previous position with the same hash, forming chains.
 * Finding the longest match at position i means walking the chain from the
 * most recent candidate backwards — visiting at most `maxChain` entries
 * inside the sliding window.
 *
 * This gives O(n · maxChain) worst case / O(n) amortized for typical
 * inputs, versus O(n · window) for naive search.
 *
 * Data structures:
 *   `_head[hash]`  → most recent position with that hash (-1 if none)
 *   `_prev[pos & (windowSize - 1)]` → previous position with the hash that
 *                                     was current when `pos` was inserted
 *
 * The `_prev` array is indexed modulo windowSize, so old entries are
 * overwritten as the window slides forward — no explicit expiry needed
 * (stale entries are detected by position distance).
 */

/** Default LZSS parameters, matching common embedded variants. */
export const DEFAULT_WINDOW_SIZE = 4096;
export const DEFAULT_MIN_MATCH = 3;
export const DEFAULT_MAX_MATCH = 258;
export const DEFAULT_MAX_CHAIN = 128;
export const HASH_BITS = 15;
export const HASH_SIZE = 1 << HASH_BITS;

/** A found match: copy `length` bytes from `distance` back. */
export interface LzMatch {
  readonly distance: number;
  readonly length: number;
}

export class LzMatchFinder {
  private readonly _windowSize: number;
  private readonly _minMatch: number;
  private readonly _maxMatch: number;
  private readonly _maxChain: number;

  /** hash → newest position. */
  private readonly _head: Int32Array;
  /** position % windowSize → previous position with same hash. */
  private readonly _prev: Int32Array;
  /** Data being indexed. */
  private _data: Uint8Array;
  /** All positions < this have been inserted into the chains. */
  private _insertedUpTo: number;

  constructor(
    windowSize: number = DEFAULT_WINDOW_SIZE,
    minMatch: number = DEFAULT_MIN_MATCH,
    maxMatch: number = DEFAULT_MAX_MATCH,
    maxChain: number = DEFAULT_MAX_CHAIN
  ) {
    if ((windowSize & (windowSize - 1)) !== 0) {
      throw new RangeError('LzMatchFinder: windowSize must be a power of two');
    }
    if (minMatch < 3) {
      throw new RangeError('LzMatchFinder: minMatch must be >= 3 (hash width)');
    }
    this._windowSize = windowSize;
    this._minMatch = minMatch;
    this._maxMatch = maxMatch;
    this._maxChain = maxChain;
    this._head = new Int32Array(HASH_SIZE);
    this._prev = new Int32Array(windowSize);
    this._data = new Uint8Array(0);
    this._insertedUpTo = 0;
  }

  /**
   * Resets the finder over a new input buffer. O(HASH_SIZE + windowSize).
   */
  reset(data: Uint8Array): void {
    this._data = data;
    this._head.fill(-1);
    this._prev.fill(-1);
    this._insertedUpTo = 0;
  }

  get windowSize(): number {
    return this._windowSize;
  }

  get minMatch(): number {
    return this._minMatch;
  }

  get maxMatch(): number {
    return this._maxMatch;
  }

  /**
   * Inserts all positions in [from, to) into the hash chains.
   * Called by the encoder as the window advances.
   *
   * Complexity: O(to - from).
   */
  insert(from: number, to: number): void {
    const limit = Math.min(to, this._data.length - (this._minMatch - 1));
    for (let pos = Math.max(from, this._insertedUpTo); pos < limit; pos++) {
      const h = this._hash(pos);
      this._prev[pos & (this._windowSize - 1)] = this._head[h];
      this._head[h] = pos;
    }
    this._insertedUpTo = Math.max(this._insertedUpTo, limit);
  }

  /**
   * Finds the longest match for the sequence starting at `pos`, searching
   * backwards through the hash chain. Candidates older than the window or
   * beyond `maxChain` hops are skipped.
   *
   * Uses the standard "lazy" heuristics adopted by zlib:
   *  - stops early if a match of `maxMatch` or `niceLength` is found
   *  - only longer candidates replace the current best
   *
   * Complexity: O(maxChain · maxMatch) worst case; typical inputs are far
   * cheaper because chains decay quickly on non-repetitive data.
   *
   * @returns The best match, or null if no match of at least minMatch
   *          bytes exists within the window.
   */
  findLongestMatch(pos: number): LzMatch | null {
    const data = this._data;
    const maxLen = Math.min(this._maxMatch, data.length - pos);
    if (maxLen < this._minMatch || pos >= data.length - (this._minMatch - 1)) {
      return null;
    }

    const h = this._hash(pos);
    let candidate = this._head[h];
    let bestLength = 0;
    let bestDistance = 0;
    const windowStart = pos - this._windowSize;
    const niceLength = Math.min(maxLen, 64);
    let chainLeft = this._maxChain;

    while (candidate > windowStart && candidate >= 0 && candidate < pos && chainLeft-- > 0) {
      // Quick reject: check the byte that would extend the current best.
      if (bestLength > 0 && data[candidate + bestLength] !== data[pos + bestLength]) {
        candidate = this._prev[candidate & (this._windowSize - 1)];
        continue;
      }

      // Measure actual match length.
      let len = 0;
      const limit = Math.min(maxLen, pos - candidate + bestLength);
      const scanLimit = Math.min(maxLen, limit + maxLen);
      while (len < scanLimit && data[candidate + len] === data[pos + len]) {
        len++;
      }

      if (len > bestLength) {
        bestLength = len;
        bestDistance = pos - candidate;
        if (len >= niceLength || len >= maxLen) {
          break;
        }
      }

      candidate = this._prev[candidate & (this._windowSize - 1)];
    }

    if (bestLength >= this._minMatch) {
      return { distance: bestDistance, length: bestLength };
    }
    return null;
  }

  /**
   * Computes the hash of the `_minMatch`-byte sequence starting at `pos`.
   * Multiplicative hash — fast and good enough for 3-byte keys.
   */
  private _hash(pos: number): number {
    const d = this._data;
    // 3-byte hash regardless of minMatch ≥ 3; longer minMatch values reuse
    // the same head width (cheap and adequate at these window sizes).
    return (((d[pos] << 10) ^ (d[pos + 1] << 5) ^ d[pos + 2]) * 0x9e3779b1) >>> (32 - HASH_BITS);
  }
}
