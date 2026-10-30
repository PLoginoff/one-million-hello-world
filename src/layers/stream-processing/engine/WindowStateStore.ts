/**
 * WindowStateStore — managed state for incremental windowed aggregation.
 *
 * Complements `WindowedAggregate` (implementations/StreamEngine.ts), which
 * is a self-contained operator. This store is for pipelines that manage
 * state themselves (custom triggers, state TTL, external sinks):
 *
 *   - `add(key, windowStart, windowEnd, ts, value, fold)` — O(1) create-or-
 *     fold with auto-created accumulators. Records arriving for a closed
 *     window are routed through a pluggable late-data policy.
 *   - `expire(watermark)` — emit results for every window whose end passed
 *     the watermark and delete the state (the "fire" step the store leaves
 *     to the caller's cadence: per-record, per-batch, or per-barrier).
 *   - `peek(key)` — read a window's tentative value before it fires
 *     (early results / dashboards).
 *   - `stateSnapshot()` / `restore()` — serializable operator state for
 *     exactly-once checkpointing.
 *
 * Layout: Map<key, Map<windowStart, WindowCell>> — same shape as the
 * WindowedAggregate internals, kept deliberately compatible.
 *
 * @module StreamProcessing/Engine
 */

import { Aggregator, WindowResult } from '../implementations/StreamEngine';
import { WatermarkGenerator } from './Watermark';

export type LateFate = 'folded' | 'dropped' | 'side-output';

export interface AddOutcome {
  /** Where the record ended up. */
  readonly fate: LateFate;
  /** Windows that received the record (may be >1 for sliding assigners). */
  readonly windowCount: number;
}

export interface LateRecordInfo<T> {
  readonly key: string;
  readonly timestamp: number;
  readonly value: T;
  /** Watermark at classification time. */
  readonly watermark: number;
}

export type LateHandler<T> = (info: LateRecordInfo<T>) => void;

export interface WindowCell<TAcc> {
  readonly start: number;
  readonly end: number;
  acc: TAcc;
  count: number;
}

interface SerializedWindow<TAcc> {
  key: string;
  start: number;
  end: number;
  acc: TAcc;
  count: number;
}

export interface StoreSnapshot<TAcc> {
  readonly windows: SerializedWindow<TAcc>[];
}

export class WindowStateStore<TIn, TAcc, TOut> {
  private readonly _windows = new Map<string, Map<number, WindowCell<TAcc>>>();
  private readonly _aggregator: Aggregator<TIn, TAcc, TOut>;
  private readonly _lateHandlers: LateHandler<TIn>[] = [];
  private _droppedLate = 0;
  private _sideOutput: LateRecordInfo<TIn>[] = [];

  constructor(aggregator: Aggregator<TIn, TAcc, TOut>) {
    this._aggregator = aggregator;
  }

  onLateRecord(h: LateHandler<TIn>): void {
    this._lateHandlers.push(h);
  }

  /**
   * Fold `value` into the window `key`@[start,end) at event `ts`.
   * If the window already expired behind `wm`, the late-policy applies:
   * the record is dropped, side-output (kept for inspection + handlers
   * notified), or the cell is re-opened and folded anyway.
   *
   * @returns where the record landed.
   */
  add(
    key: string,
    windowStart: number,
    windowEnd: number,
    ts: number,
    value: TIn,
    wm: number,
    latePolicy: 'drop' | 'side-output' | 'accept'
  ): AddOutcome {
    if (windowEnd <= wm) {
      this._droppedLate++;
      const info: LateRecordInfo<TIn> = { key, timestamp: ts, value, watermark: wm };
      if (latePolicy === 'accept') {
        return { fate: this._fold(key, windowStart, windowEnd, value), windowCount: 1 };
      }
      if (latePolicy === 'side-output') {
        this._sideOutput.push(info);
      }
      for (const h of this._lateHandlers) h(info);
      return { fate: latePolicy === 'side-output' ? 'side-output' : 'dropped', windowCount: 0 };
    }
    return { fate: this._fold(key, windowStart, windowEnd, value), windowCount: 1 };
  }

  private _fold(key: string, start: number, end: number, value: TIn): LateFate {
    let byWindow = this._windows.get(key);
    if (!byWindow) {
      byWindow = new Map();
      this._windows.set(key, byWindow);
    }
    let cell = byWindow.get(start);
    if (!cell) {
      cell = { start, end, acc: this._aggregator.createAccumulator(), count: 0 };
      byWindow.set(start, cell);
    }
    cell.acc = this._aggregator.add(cell.acc, value);
    cell.count++;
    return 'folded';
  }

  /**
   * Fire every window whose end <= watermark: emit its result via the
   * aggregator and delete the state. Returns the emitted results.
   */
  expire(wm: number): WindowResult<TOut>[] {
    return this.expireWithAccs(wm).map((e) => e.result);
  }

  /**
   * Same as `expire` but also returns the deleted accumulator per window
   * — needed by retention policies (retractions, late corrections) that
   * must keep folding into the window's true state after it fired.
   */
  expireWithAccs(wm: number): { result: WindowResult<TOut>; acc: TAcc }[] {
    const out: { result: WindowResult<TOut>; acc: TAcc }[] = [];
    for (const [key, byWindow] of this._windows) {
      for (const [start, cell] of byWindow) {
        if (cell.end <= wm) {
          out.push({
            result: {
              window: { start: cell.start, end: cell.end },
              key,
              value: this._aggregator.getResult(cell.acc),
              count: cell.count,
            },
            acc: cell.acc,
          });
          byWindow.delete(start);
        }
      }
      if (byWindow.size === 0) this._windows.delete(key);
    }
    return out;
  }

  /**
   * Convenience: advance a watermark generator with `eventTimeMs` then
   * expire. The standard per-record pipeline step.
   */
  advanceAndExpire(gen: WatermarkGenerator, eventTimeMs: number): WindowResult<TOut>[] {
    return this.expire(gen.observe(eventTimeMs));
  }

  /** Tentative value of an open window (pre-fire read). */
  peek(key: string, windowStart: number): { value: TOut; count: number } | undefined {
    const cell = this._windows.get(key)?.get(windowStart);
    if (!cell) return undefined;
    return { value: this._aggregator.getResult(cell.acc), count: cell.count };
  }

  /** All open windows for a key (snapshot / debug). */
  openWindows(key: string): { start: number; end: number; count: number }[] {
    const m = this._windows.get(key);
    if (!m) return [];
    return [...m.values()].map((c) => ({ start: c.start, end: c.end, count: c.count }));
  }

  /** Records diverted to the side-output so far. */
  sideOutputs(): readonly LateRecordInfo<TIn>[] {
    return this._sideOutput;
  }

  droppedLateCount(): number {
    return this._droppedLate;
  }

  openWindowCount(): number {
    let n = 0;
    for (const m of this._windows.values()) n += m.size;
    return n;
  }

  /** Force-fire everything (drain semantics). */
  flush(): WindowResult<TOut>[] {
    return this.expire(Number.POSITIVE_INFINITY);
  }

  /** Serializable operator state for checkpointing. */
  stateSnapshot(): StoreSnapshot<TAcc> {
    const windows: SerializedWindow<TAcc>[] = [];
    for (const [key, byWindow] of this._windows) {
      for (const cell of byWindow.values()) {
        windows.push({ key, start: cell.start, end: cell.end, acc: cell.acc, count: cell.count });
      }
    }
    return { windows };
  }

  restore(snapshot: StoreSnapshot<TAcc>): void {
    this._windows.clear();
    for (const w of snapshot.windows) {
      let m = this._windows.get(w.key);
      if (!m) {
        m = new Map();
        this._windows.set(w.key, m);
      }
      m.set(w.start, { start: w.start, end: w.end, acc: w.acc, count: w.count });
    }
  }
}
