/**
 * LateDataPolicy — pluggable handling for records behind the watermark.
 *
 * A record is "late" when its event-time is already past the watermark:
 * the windows it belonged to have fired (or will never accept it).
 * What to do is a business decision, so it's policy, not mechanism:
 *
 *   'drop'        — discard silently (default in most engines; fine for
 *                   telemetry).
 *   'side-output' — divert to a separate collection for later audit /
 *                   batch reprocessing (the data lake path).
 *   'accept'      — fold into the window anyway (the cell re-opens and
 *                   re-fires at the next expiry check).
 *   'retract'     — full-correctness mode (Flink allowedLateness +
 *                   retractions): when a window fires its accumulator is
 *                   RETAINED for `allowedLatenessMs`; a late record merges
 *                   into that true state and emits a corrected
 *                   WindowResult which downstream must treat as
 *                   superseding the previous result for that window.
 *
 * `LateDataRouter` wraps a WindowStateStore: it classifies each record
 * against the current watermark and routes it.
 *
 * @module StreamProcessing/Engine
 */

import { WindowResult, WindowAssigner, Aggregator } from '../implementations/StreamEngine';
import { WindowStateStore } from './WindowStateStore';
import { WatermarkGenerator } from './Watermark';

export type LateAction = 'folded' | 'dropped' | 'side-output' | 'retracted';

export type LatePolicyName = 'drop' | 'side-output' | 'accept' | 'retract';

interface RetainedCell<TAcc, TOut> {
  acc: TAcc;
  count: number;
  /** Last emitted result — what a correction supersedes. */
  lastEmitted: WindowResult<TOut>;
}

export interface RouterOptions {
  /** For 'retract': how long (past window end) accumulators are kept for
   *  corrections. Beyond `window.end + allowedLatenessMs` a record can no
   *   longer correct — it is side-output instead. */
  readonly allowedLatenessMs?: number;
}

export class LateDataRouter<TIn, TAcc, TOut> {
  private readonly _store: WindowStateStore<TIn, TAcc, TOut>;
  private readonly _assigner: WindowAssigner;
  private readonly _gen: WatermarkGenerator;
  private readonly _aggregator: Aggregator<TIn, TAcc, TOut>;
  private readonly _policy: LatePolicyName;
  private readonly _allowedLatenessMs: number;
  /** marker "key@start" -> fired-but-retained window state (retract mode). */
  private readonly _retained = new Map<string, RetainedCell<TAcc, TOut>>();
  private readonly _corrections: WindowResult<TOut>[] = [];
  private readonly _firedLog = new Map<string, WindowResult<TOut>>();

  constructor(
    store: WindowStateStore<TIn, TAcc, TOut>,
    assigner: WindowAssigner,
    gen: WatermarkGenerator,
    aggregator: Aggregator<TIn, TAcc, TOut>,
    policy: LatePolicyName = 'drop',
    options: RouterOptions = {}
  ) {
    this._store = store;
    this._assigner = assigner;
    this._gen = gen;
    this._aggregator = aggregator;
    this._policy = policy;
    this._allowedLatenessMs = options.allowedLatenessMs ?? 0;
  }

  /**
   * Process one record: advance the watermark, route to the record's
   * windows under the late policy, fire expired windows, retain fired
   * accumulators (retract mode), prune retention.
   *
   * @returns action taken for THIS record + all window results that fired
   *          because of it + corrections emitted for late records.
   */
  process(key: string, timestamp: number, value: TIn): {
    action: LateAction;
    fired: WindowResult<TOut>[];
    corrections: WindowResult<TOut>[];
  } {
    const wm = this._gen.observe(timestamp);
    const windows = this._assigner(timestamp);
    const corrections: WindowResult<TOut>[] = [];
    let action: LateAction = 'folded';
    let folded = 0;

    for (const w of windows) {
      const isLate = w.end <= wm;
      if (isLate && this._policy === 'retract') {
        const cell = this._retained.get(`${key}@${w.start}`);
        if (cell) {
          cell.acc = this._aggregator.add(cell.acc, value);
          cell.count++;
          const corrected: WindowResult<TOut> = {
            window: { start: w.start, end: w.end },
            key,
            value: this._aggregator.getResult(cell.acc),
            count: cell.count,
          };
          cell.lastEmitted = corrected;
          this._corrections.push(corrected);
          corrections.push(corrected);
          action = 'retracted';
        } else {
          // Beyond retention (or never tracked): too late even to correct.
          const outcome = this._store.add(key, w.start, w.end, timestamp, value, wm, 'side-output');
          if (action !== 'retracted') {
            action = outcome.fate === 'side-output' ? 'side-output' : 'dropped';
          }
        }
      } else {
        const outcome = this._store.add(
          key, w.start, w.end, timestamp, value, wm,
          this._policy === 'retract' ? 'accept' : this._policy
        );
        if (outcome.fate === 'folded') folded++;
        else if (outcome.fate === 'side-output') action = 'side-output';
        else if (outcome.fate === 'dropped' && action === 'folded') action = 'dropped';
      }
    }
    if (folded === 0 && action === 'folded') action = 'dropped';

    // Fire expired windows — and salvage their accumulators for the
    // retention map BEFORE they're gone.
    const firedResults: WindowResult<TOut>[] = [];
    for (const e of this._store.expireWithAccs(this._gen.current())) {
      const marker = `${e.result.key}@${e.result.window.start}`;
      this._firedLog.set(marker, e.result);
      firedResults.push(e.result);
      if (this._policy === 'retract') {
        this._retained.set(marker, {
          acc: e.acc,
          count: e.result.count,
          lastEmitted: e.result,
        });
      }
    }
    this._expireRetained(this._gen.current());
    return { action, fired: firedResults, corrections };
  }

  private _expireRetained(wm: number): void {
    if (this._policy !== 'retract') return;
    const horizon = wm - this._allowedLatenessMs;
    for (const [marker, cell] of this._retained) {
      if (cell.lastEmitted.window.end <= horizon) this._retained.delete(marker);
    }
  }

  /** Corrective results emitted by the 'retract' policy (drained). */
  drainCorrections(): WindowResult<TOut>[] {
    const out = [...this._corrections];
    this._corrections.length = 0;
    return out;
  }

  /** Last result emitted per window (fired or corrected). */
  lastEmitted(key: string, windowStart: number): WindowResult<TOut> | undefined {
    const cell = this._retained.get(`${key}@${windowStart}`);
    if (cell) return cell.lastEmitted;
    return this._firedLog.get(`${key}@${windowStart}`);
  }

  get watermark(): number {
    return this._gen.current();
  }

  retainedWindowCount(): number {
    return this._retained.size;
  }
}
