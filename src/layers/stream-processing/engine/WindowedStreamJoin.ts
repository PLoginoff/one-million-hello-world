/**
 * WindowedStreamJoin — join two streams within the same time window.
 *
 * Different join semantics than `IntervalJoin` (implementations/):
 * IntervalJoin matches per-record intervals (tR ∈ [tL+low, tL+high]).
 * Here both sides are bucketed into SHARED time windows [wStart, wEnd)
 * and every left×right pair within the same (key, window) is emitted —
 * the Flink "window join". Typical use: clicks × impressions per 10-min
 * window, orders × payments per hour.
 *
 *   left(ts, key, rec) ─┐
 *                       ├─> buffer[(key, windowStart)] → on join → pairs
 *   right(ts, key, rec)─┘
 *
 *   watermark passes window.end + retentionMs → prune buffer;
 *   leftover lefts/rights are reported as unmatched (outer-join input).
 *
 * State layout: Map<joinKey, Map<windowStart, {lefts, rights}>> — O(1)
 * routing, bucket-level pruning (no per-record scan).
 *
 * @module StreamProcessing/Engine
 */

import { Window, WindowAssigner } from '../implementations/StreamEngine';
import { WatermarkGenerator } from './Watermark';

export interface JoinPair<L, R> {
  readonly key: string;
  readonly window: Window;
  readonly left: L;
  readonly right: R;
}

export interface Unmatched {
  readonly key: string;
  readonly window: Window;
  readonly side: 'left' | 'right';
  readonly record: unknown;
}

interface JoinCell<L, R> {
  readonly start: number;
  readonly end: number;
  lefts: { ts: number; value: L }[];
  rights: { ts: number; value: R }[];
}

export class WindowedStreamJoin<L, R> {
  private readonly _cells = new Map<string, Map<number, JoinCell<L, R>>>();
  private readonly _assigner: WindowAssigner;
  private readonly _gen: WatermarkGenerator;
  private readonly _retentionMs: number;
  /** Emit left×right pairs eagerly as records arrive (default true). */
  private readonly _eager: boolean;
  private readonly _output: JoinPair<L, R>[] = [];
  private readonly _unmatched: Unmatched[] = [];
  private _prunedCells = 0;

  constructor(
    assigner: WindowAssigner,
    gen: WatermarkGenerator,
    options: { retentionMs?: number; eager?: boolean } = {}
  ) {
    this._assigner = assigner;
    this._gen = gen;
    this._retentionMs = options.retentionMs ?? 0;
    this._eager = options.eager ?? true;
  }

  left(key: string, timestamp: number, value: L): JoinPair<L, R>[] {
    return this._side('left', key, timestamp, value);
  }

  right(key: string, timestamp: number, value: R): JoinPair<L, R>[] {
    return this._side('right', key, timestamp, value);
  }

  private _side<S>(side: 'left' | 'right', key: string, ts: number, value: S): JoinPair<L, R>[] {
    const wm = this._gen.observe(ts);
    const emitted: JoinPair<L, R>[] = [];

    for (const w of this._assigner(ts)) {
      if (w.end + this._retentionMs <= wm) {
        // Window already pruned — record is too late to join.
        this._unmatched.push({ key, window: w, side, record: value });
        continue;
      }
      const cell = this._cell(key, w);
      if (side === 'left') {
        cell.lefts.push({ ts, value: value as unknown as L });
        if (this._eager) {
          for (const r of cell.rights) {
            const pair: JoinPair<L, R> = { key, window: w, left: value as unknown as L, right: r.value };
            emitted.push(pair);
            this._output.push(pair);
          }
        }
      } else {
        cell.rights.push({ ts, value: value as unknown as R });
        if (this._eager) {
          for (const l of cell.lefts) {
            const pair: JoinPair<L, R> = { key, window: w, left: l.value, right: value as unknown as R };
            emitted.push(pair);
            this._output.push(pair);
          }
        }
      }
    }
    this._prune(wm);
    return emitted;
  }

  private _cell(key: string, w: Window): JoinCell<L, R> {
    let byWindow = this._cells.get(key);
    if (!byWindow) {
      byWindow = new Map();
      this._cells.set(key, byWindow);
    }
    let cell = byWindow.get(w.start);
    if (!cell) {
      cell = { start: w.start, end: w.end, lefts: [], rights: [] };
      byWindow.set(w.start, cell);
    }
    return cell;
  }

  /**
   * Drop buffers for windows fully behind the watermark (+retention).
   * In lazy (non-eager) mode the cartesian product is emitted here;
   * unmatched leftovers are always reported for outer-join handling.
   */
  private _prune(wm: number): void {
    const horizon = wm - this._retentionMs;
    for (const [key, byWindow] of this._cells) {
      for (const [start, cell] of byWindow) {
        if (cell.end <= horizon) {
          if (!this._eager) {
            for (const l of cell.lefts) {
              for (const r of cell.rights) {
                this._output.push({
                  key,
                  window: { start: cell.start, end: cell.end },
                  left: l.value,
                  right: r.value,
                });
              }
            }
          }
          for (const l of cell.lefts) {
            if (cell.rights.length === 0) {
              this._unmatched.push({ key, window: { start, end: cell.end }, side: 'left', record: l.value });
            }
          }
          for (const r of cell.rights) {
            if (cell.lefts.length === 0) {
              this._unmatched.push({ key, window: { start, end: cell.end }, side: 'right', record: r.value });
            }
          }
          byWindow.delete(start);
          this._prunedCells++;
        }
      }
      if (byWindow.size === 0) this._cells.delete(key);
    }
  }

  /** Buffered cells still joinable (diagnostics / state size). */
  openCellCount(): number {
    let n = 0;
    for (const m of this._cells.values()) n += m.size;
    return n;
  }

  prunedCellCount(): number {
    return this._prunedCells;
  }

  /** All emitted pairs so far (drained). */
  drain(): JoinPair<L, R>[] {
    const out = [...this._output];
    this._output.length = 0;
    return out;
  }

  /** Leftovers that never matched (outer-join / DLQ input). */
  drainUnmatched(): Unmatched[] {
    const out = [...this._unmatched];
    this._unmatched.length = 0;
    return out;
  }

  get watermark(): number {
    return this._gen.current();
  }
}
