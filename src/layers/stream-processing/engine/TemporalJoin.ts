/**
 * TemporalJoin — stream↔stream join bounded by event-time proximity.
 *
 * The existing joins cover two corners:
 *   `IntervalJoin` (implementations/) — per-record intervals
 *     tR ∈ [tL + low, tL + high], eager pair emission.
 *   `WindowedStreamJoin` (engine/) — same-window cartesian product.
 *
 * This module fills the third: **asymmetric temporal join**, the
 * "enrichment" pattern — every left record joins to the *best* right
 * record inside a time bound, not all of them. Two modes:
 *
 *   'nearest'   — the right record minimizing |tR - tL| within
 *                 [-beforeMs, +afterMs] of tL. Classic for
 *                 "join the tick to the nearest prior quote".
 *   'latest-before' — the newest right record with tR <= tL and
 *                 tR >= tL - beforeMs (asof join: "the price in effect
 *                 when the trade executed"). afterMs is unused here.
 *
 * Per-key right buffers are kept sorted by timestamp so lookup is
 * binary search, O(log n) per left record. Buffers prune at the
 * watermark: rights older than wm - afterMs - beforeMs can never match
 * a future left (any left they could serve would itself be too late),
 * and pending lefts older than wm - afterMs can never be matched by a
 * future right — they expire as unmatched.
 *
 * Two emission strategies:
 *   - eager:  emit when a left arrives and a match exists already
 *             (synchronous joins, low latency);
 *   - complete: buffer lefts, emit on `tick(wm)` so a later-arriving
 *             better right can win (correctness over latency — a
 *             slightly-late right that *is* the nearest match beats an
 *             on-time worse one).
 *
 * @module StreamProcessing/Engine
 */

import { WatermarkGenerator } from './Watermark';

export interface Timed<T> {
  readonly ts: number;
  readonly value: T;
}

export interface TemporalPair<L, R> {
  readonly key: string;
  readonly left: Timed<L>;
  readonly right: Timed<R>;
  /** |right.ts - left.ts| — the match quality for 'nearest' mode. */
  readonly distanceMs: number;
}

export interface UnmatchedLeft<L> {
  readonly key: string;
  readonly left: Timed<L>;
  readonly reason: 'no-candidate' | 'expired-watermark';
}

export type TemporalJoinMode = 'nearest' | 'latest-before';

export interface TemporalJoinOptions {
  /** How far back a right may be from the left (ms). */
  beforeMs: number;
  /** How far forward a right may be (ms). Only used by 'nearest'. */
  afterMs: number;
  mode: TemporalJoinMode;
  /** 'eager' emits on left arrival if a match exists; 'complete' waits
   *  for the watermark so a better late right can win. */
  emit?: 'eager' | 'complete';
}

interface PendingLeft<L> {
  readonly key: string;
  readonly left: Timed<L>;
}

export class TemporalJoin<L, R> {
  private readonly _mode: TemporalJoinMode;
  private readonly _beforeMs: number;
  private readonly _afterMs: number;
  private readonly _eager: boolean;
  private readonly _gen: WatermarkGenerator;
  /** key -> rights sorted by ts (insertion kept sorted via binary search). */
  private readonly _rights = new Map<string, Timed<R>[]>();
  /** Pending lefts (complete mode): key -> lefts. */
  private readonly _pending = new Map<string, PendingLeft<L>[]>();
  private readonly _out: TemporalPair<L, R>[] = [];
  private readonly _unmatched: UnmatchedLeft<L>[] = [];
  private _prunedRights = 0;
  private _expiredLefts = 0;

  constructor(gen: WatermarkGenerator, options: TemporalJoinOptions) {
    if (options.beforeMs < 0 || options.afterMs < 0) {
      throw new Error('beforeMs/afterMs must be >= 0');
    }
    this._mode = options.mode;
    this._beforeMs = options.beforeMs;
    this._afterMs = options.afterMs;
    this._eager = (options.emit ?? 'complete') === 'eager';
    this._gen = gen;
  }

  // ------------------------------------------------------------ input

  /** Feed a left record. In eager mode returns emitted pairs. */
  left(key: string, timestamp: number, value: L): TemporalPair<L, R>[] {
    const wm = this._gen.observe(timestamp);
    const emitted: TemporalPair<L, R>[] = [];
    const leftRec: Timed<L> = { ts: timestamp, value };
    if (this._eager) {
      const match = this._match(key, leftRec);
      if (match) {
        emitted.push(match);
        this._out.push(match);
      } else {
        // Eager + no current match: still buffer — a right arriving
        // within the bound can still match (rights arrive late too).
        this._pendLeft(key, timestamp, value);
      }
    } else {
      // complete mode resolves at tick()/right-arrival.
      this._pendLeft(key, timestamp, value);
    }
    this._prune(wm);
    return emitted;
  }

  /** Feed a right record. May resolve pending lefts. */
  right(key: string, timestamp: number, value: R): TemporalPair<L, R>[] {
    const wm = this._gen.observe(timestamp);
    this._insertSorted(key, { ts: timestamp, value });
    const emitted: TemporalPair<L, R>[] = [];
    if (this._eager) {
      // New right may match buffered lefts — re-resolve them now.
      const pend = this._pending.get(key);
      if (pend) {
        const still: PendingLeft<L>[] = [];
        for (const pl of pend) {
          const m = this._match(key, pl.left);
          if (m) {
            emitted.push(m);
            this._out.push(m);
          } else {
            still.push(pl);
          }
        }
        if (still.length) this._pending.set(key, still);
        else this._pending.delete(key);
      }
    }
    this._prune(wm);
    return emitted;
  }

  private _pendLeft(key: string, ts: number, value: L): void {
    let list = this._pending.get(key);
    if (!list) {
      list = [];
      this._pending.set(key, list);
    }
    list.push({ key, left: { ts, value } });
  }

  /** Insert a right record keeping the buffer sorted by ts — O(n) shift
   *  worst case, but rights arrive roughly time-ordered so the insertion
   *  point is usually near the tail. */
  private _insertSorted(key: string, rec: Timed<R>): void {
    let list = this._rights.get(key);
    if (!list) {
      list = [];
      this._rights.set(key, list);
    }
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].ts <= rec.ts) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, rec);
  }

  // ------------------------------------------------------------ match

  /**
   * Find the best right for a left record under the current mode.
   * Binary search on the sorted right buffer: O(log n) locate + O(1)
   * neighbor compare for 'nearest'.
   */
  private _match(key: string, left: Timed<L>): TemporalPair<L, R> | null {
    const rights = this._rights.get(key);
    if (!rights || !rights.length) return null;
    const ts = left.ts;

    // Binary search: first index with rights[i].ts > ts (the successor).
    let lo = 0;
    let hi = rights.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rights[mid].ts <= ts) lo = mid + 1;
      else hi = mid;
    }
    // Candidates: lo-1 (last <= ts) and lo (first > ts).
    const before = lo > 0 ? rights[lo - 1] : null;
    const after = lo < rights.length ? rights[lo] : null;

    if (this._mode === 'latest-before') {
      if (before && ts - before.ts <= this._beforeMs) {
        return { key, left, right: before, distanceMs: ts - before.ts };
      }
      return null;
    }

    // 'nearest': pick the closer of before/after within its bound.
    let best: Timed<R> | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    if (before && ts - before.ts <= this._beforeMs && ts - before.ts < bestDist) {
      best = before;
      bestDist = ts - before.ts;
    }
    if (after && after.ts - ts <= this._afterMs && after.ts - ts < bestDist) {
      best = after;
      bestDist = after.ts - ts;
    }
    return best ? { key, left, right: best, distanceMs: bestDist } : null;
  }

  // ---------------------------------------------------------- pruning

  /**
   * Resolve pending lefts that can no longer be matched, and prune
   * rights too old to ever match a future left.
   *
   * Right liveness bound: a right at tR can match a left at tL iff
   *   latest-before: tL - beforeMs <= tR <= tL
   *   nearest:       tL - beforeMs <= tR <= tL + afterMs
   * In BOTH modes the furthest-forward left a right serves is
   *   tL = tR + beforeMs — lefts stop arriving once wm > tL, i.e.
   *   the right is dead when wm > tR + beforeMs.
   * (afterMs lets a left look FORWARD at future rights — it never
   * extends a right's reach backward, so it doesn't widen the bound.)
   */
  private _prune(wm: number): void {
    // Order matters: resolve pending lefts BEFORE pruning rights — a
    // right past the horizon may still be the match an expiring left
    // needs (the horizon assumes future lefts, not buffered ones).

    // 'latest-before' never matches a right ABOVE the left, so a pending
    // left resolves as soon as wm > tL — a right at tR == tL can still
    // legitimately arrive while wm <= tL, so the bound is strict.
    // 'nearest' additionally waits the full afterMs for a forward match.
    for (const [key, list] of this._pending) {
      const remaining: PendingLeft<L>[] = [];
      for (const pl of list) {
        const deadline =
          this._mode === 'latest-before' ? pl.left.ts : pl.left.ts + this._afterMs;
        if (deadline < wm) {
          const m = this._match(key, pl.left);
          if (m) {
            // Match exists at expiry — emit it (complete mode's payoff:
            // the BEST right inside the bound, not the first).
            this._out.push(m);
          } else {
            this._unmatched.push({ key, left: pl.left, reason: 'no-candidate' });
          }
          this._expiredLefts++;
        } else {
          remaining.push(pl);
        }
      }
      if (remaining.length) this._pending.set(key, remaining);
      else this._pending.delete(key);
    }

    const rightHorizon = wm - this._beforeMs;
    for (const [key, rights] of this._rights) {
      // Find first index >= horizon — rights are sorted by ts.
      let lo = 0;
      let hi = rights.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (rights[mid].ts <= rightHorizon) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) {
        rights.splice(0, lo);
        this._prunedRights += lo;
      }
      if (rights.length === 0) this._rights.delete(key);
    }
  }

  // ------------------------------------------------------------ output

  /** Advance the watermark externally (idle-source flush) and resolve. */
  tick(watermarkOverride?: number): TemporalPair<L, R>[] {
    const wm = watermarkOverride ?? this._gen.current();
    this._prune(wm);
    return this.drain();
  }

  /** Emitted pairs so far (drains the buffer). */
  drain(): TemporalPair<L, R>[] {
    const out = [...this._out];
    this._out.length = 0;
    return out;
  }

  /** Lefts that expired without a match (outer-join / DLQ input). */
  drainUnmatched(): UnmatchedLeft<L>[] {
    const out = [...this._unmatched];
    this._unmatched.length = 0;
    return out;
  }

  /** Buffered rights for a key (diagnostics / state size). */
  bufferedRights(key: string): number {
    return this._rights.get(key)?.length ?? 0;
  }

  pendingLefts(): number {
    let n = 0;
    for (const l of this._pending.values()) n += l.length;
    return n;
  }

  get prunedRights(): number {
    return this._prunedRights;
  }

  get expiredLefts(): number {
    return this._expiredLefts;
  }

  get watermark(): number {
    return this._gen.current();
  }
}
