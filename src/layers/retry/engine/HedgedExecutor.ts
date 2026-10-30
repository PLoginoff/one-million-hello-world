/**
 * HedgedExecutor — speculative (hedged) retries for tail latency.
 *
 * Sometimes the original request isn't *failing*, it's just slow — the
 * p99 latency is 20x the median. A hedged request fires a duplicate
 * after `hedgeDelayMs` if the original hasn't answered: whichever
 * finishes first wins. The loser is abandoned (its promise is left
 * running — JS can't cancel, but its result is discarded).
 *
 * This is the Google "Tail at Scale" pattern: at p99, hedging can cut
 * tail latency dramatically at the cost of a small increase in total
 * request volume (~1 extra request per slow request).
 *
 * Model:
 *   - `execute(op, hedgeDelayMs)` starts `op` and, if it hasn't
 *     resolved in `hedgeDelayMs`, starts a *second* `op` — first to
 *     resolve wins;
 *   - `maxHedges` bounds total concurrent attempts (default 2 = 1 hedge);
 *   - hedges only fire for operations whose failure signature isn't
 *     yet known — a definitive error cancels pending hedges;
 *   - statistics track hedge rate so callers can bound cost.
 *
 * Uses an injectable `timerFn` for the hedge delay so tests are
 * deterministic without real waits.
 *
 * @module RetryLayer/Engine
 */

import { RetryEngineClock, SystemEngineClock } from './types';

export type HedgeTimerFn = (ms: number) => Promise<void>;

const realTimer: HedgeTimerFn = (ms) => new Promise((r) => setTimeout(r, ms));

export interface HedgedOptions {
  /** Delay before first hedge (ms). Default 100. */
  hedgeDelayMs?: number;
  /** Total concurrent attempts allowed (original + hedges). Default 2. */
  maxAttempts?: number;
  timerFn?: HedgeTimerFn;
  clock?: RetryEngineClock;
}

export interface HedgedResult<T> {
  value: T;
  /** Which attempt won (0 = original, 1+ = hedge). */
  winningAttempt: number;
  /** Total attempts fired. */
  attemptsFired: number;
  /** True when the win came from a hedge (tail-latency save). */
  hedgeWon: boolean;
}

export class HedgedExecutor {
  private readonly _clock: RetryEngineClock;
  private readonly _defaultDelayMs: number;
  private readonly _maxAttempts: number;
  private readonly _timer: HedgeTimerFn;

  private _totalCalls = 0;
  private _totalHedges = 0;
  private _hedgeWins = 0;

  constructor(options: HedgedOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._defaultDelayMs = Math.max(0, options.hedgeDelayMs ?? 100);
    this._maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    this._timer = options.timerFn ?? realTimer;
  }

  /**
   * Run `op`, firing hedges after `hedgeDelayMs` (or the configured
   * default). `op` should be side-effect-idempotent — hedges are
   * duplicate calls.
   */
  async execute<T>(op: () => Promise<T> | T, hedgeDelayMs?: number): Promise<HedgedResult<T>> {
    this._totalCalls++;
    const delay = hedgeDelayMs ?? this._defaultDelayMs;
    const maxAttempts = this._maxAttempts;

    interface Attempt {
      done: boolean;
      won: boolean;
      value?: T;
      error?: unknown;
    }
    const state: Attempt = { done: false, won: false };
    let attemptsFired = 0;
    let resolved = false;
    let winner = -1;
    let winValue: T | undefined;
    let winError: unknown;

    const fire = (idx: number): Promise<void> =>
      Promise.resolve()
        .then(() => op())
        .then((v) => {
          if (!resolved) {
            resolved = true;
            winner = idx;
            winValue = v;
          }
          state.done = true;
        })
        .catch((e: unknown) => {
          if (!resolved) {
            resolved = true;
            winner = idx;
            winError = e;
          }
          state.done = true;
        });

    // Fire the original.
    void fire(0);
    attemptsFired = 1;

    // Hedge loop: while not resolved and attempts remain, fire another.
    while (!resolved && attemptsFired < maxAttempts) {
      const idx = attemptsFired;
      attemptsFired++;
      this._totalHedges++;
      // Start hedge after delay, but only if not already resolved.
      void this._timer(delay).then(() => {
        if (!resolved) void fire(idx);
      });
    }

    // Wait for whichever attempt resolves first.
    await new Promise<void>((res) => {
      const check = (): void => {
        if (resolved) res();
        else setTimeout(check, 1);
      };
      check();
    });
    void this._clock;

    if (winError !== undefined && winner < 0) throw winError;
    if (winner > 0) this._hedgeWins++;
    if (winError !== undefined) throw winError;
    return {
      value: winValue as T,
      winningAttempt: winner,
      attemptsFired,
      hedgeWon: winner > 0,
    };
  }

  stats(): { totalCalls: number; totalHedges: number; hedgeWins: number; hedgeWinRate: number } {
    return {
      totalCalls: this._totalCalls,
      totalHedges: this._totalHedges,
      hedgeWins: this._hedgeWins,
      hedgeWinRate: this._totalCalls > 0 ? this._hedgeWins / this._totalCalls : 0,
    };
  }
}
