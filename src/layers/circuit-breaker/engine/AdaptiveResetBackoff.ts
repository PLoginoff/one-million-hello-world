/**
 * AdaptiveResetBackoff — exponential backoff on consecutive open→probe
 * cycles ("breaker keeps failing → back off harder").
 *
 * A fixed `resetTimeoutMs` is wrong at both ends of a flapping outage:
 * too short and the breaker re-opens a dozen times a second on a dead
 * backend; too long and recovery is discovered late. This component
 * tracks consecutive failed half-open cycles and grows the timeout:
 *
 *   resetTimeout_n = min(capMs, baseResetMs · factor^failuresInRow)
 *
 * On a successful close the counter resets — the backend is healthy,
 * so future outages start at the base timeout again. This is the
 * "adaptive reset" pattern from Polly/resilience4j extended to the
 * breaker lifecycle.
 *
 * Usage: `nextResetTimeout()` after each transition to OPEN;
 * `reset()` on a successful half-open close.
 *
 * @module CircuitBreakerLayer/Engine
 */

import { BreakerEngineClock, SystemEngineClock } from './types';

export interface ResetBackoffOptions {
  /** First reset timeout after the first open (ms). */
  baseResetMs: number;
  /** Growth multiplier per consecutive failed probe cycle. Default 2. */
  factor?: number;
  /** Hard cap on any reset timeout (ms). Default 5 min. */
  capMs?: number;
  /** Jitter fraction [0,1] applied to the computed timeout. Default 0.2. */
  jitter?: number;
  random?: () => number;
  clock?: BreakerEngineClock;
}

export class AdaptiveResetBackoff {
  private readonly _clock: BreakerEngineClock;
  private readonly _baseMs: number;
  private readonly _factor: number;
  private readonly _capMs: number;
  private readonly _jitter: number;
  private readonly _rand: () => number;

  private _consecutiveOpenCycles = 0;
  private _totalOpenCycles = 0;
  private _lastOpenedAt = 0;

  constructor(options: ResetBackoffOptions) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._baseMs = Math.max(0, options.baseResetMs);
    this._factor = Math.max(1, options.factor ?? 2);
    this._capMs = Math.max(this._baseMs, options.capMs ?? 300_000);
    this._jitter = Math.max(0, Math.min(1, options.jitter ?? 0.2));
    this._rand = options.random ?? Math.random;
  }

  /**
   * Call when the breaker transitions to OPEN — records the cycle and
   * returns the *next* reset timeout to use.
   */
  nextResetTimeout(): number {
    this._consecutiveOpenCycles++;
    this._totalOpenCycles++;
    this._lastOpenedAt = this._clock.now();
    const grown = this._baseMs * Math.pow(this._factor, this._consecutiveOpenCycles - 1);
    const capped = Math.min(this._capMs, grown);
    const span = capped * this._jitter;
    const jittered = capped + (this._rand() * 2 - 1) * span;
    return Math.max(0, Math.round(jittered));
  }

  /** Call when the breaker closes successfully — resets the streak. */
  reset(): void {
    this._consecutiveOpenCycles = 0;
  }

  /** Consecutive open cycles without an intervening close. */
  get streak(): number {
    return this._consecutiveOpenCycles;
  }

  get totalCycles(): number {
    return this._totalOpenCycles;
  }

  /** Current reset timeout without recording a new cycle. */
  current(): number {
    const grown = this._baseMs * Math.pow(this._factor, this._consecutiveOpenCycles);
    return Math.min(this._capMs, grown);
  }
}
