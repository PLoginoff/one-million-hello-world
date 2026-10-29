/**
 * AIMD adaptive throttle — additive-increase / multiplicative-decrease.
 *
 * Models TCP congestion control over a concurrency limit: the limit grows
 * additively on success (`+increasePerSuccess`, default +1/RTT-window via
 * configurable increment) and halves on failure (`×beta`, default 0.5),
 * bounded by `[minLimit, maxLimit]`.
 *
 * Why AIMD: additive growth probes for available capacity slowly while
 * multiplicative backoff reacts to overload fast — the same stability
 * argument as TCP Reno. Under sustained failures the limit converges to
 * `minLimit`; under sustained success it approaches `maxLimit`
 * logarithmically (time to grow L→max ≈ (max−L)/increment calls).
 *
 * Success/failure is decided by a caller-supplied probe: `onSuccess`
 * after a completed operation, `onFailure` on error/timeout/rejection.
 *
 * @module Throttling/Strategies
 */

import { ThrottleMetrics, emptyMetrics } from '../domain/throttle-model';

export interface AimdOptions {
  readonly minLimit: number;
  readonly maxLimit: number;
  readonly initialLimit?: number;
  /** Additive increment per success. Default 1. */
  readonly increasePerSuccess?: number;
  /** Multiplicative decrease on failure, in (0,1). Default 0.5. */
  readonly decreaseFactor?: number;
  /**
   * Successes required before each increase — smooths growth so a single
   * fast success doesn't jump the limit. Default 1.
   */
  readonly successesPerIncrease?: number;
}

export class AimdStrategy {
  readonly name = 'aimd';

  private readonly _min: number;
  private readonly _max: number;
  private readonly _inc: number;
  private readonly _dec: number;
  private readonly _perInc: number;
  private _limit: number;
  private _successStreak = 0;
  private readonly _metrics: ThrottleMetrics = emptyMetrics();

  constructor(options: AimdOptions) {
    if (options.minLimit <= 0 || options.maxLimit < options.minLimit) {
      throw new Error('require 0 < minLimit <= maxLimit');
    }
    this._min = options.minLimit;
    this._max = options.maxLimit;
    this._inc = options.increasePerSuccess ?? 1;
    this._dec = options.decreaseFactor ?? 0.5;
    this._perInc = options.successesPerIncrease ?? 1;
    if (this._dec <= 0 || this._dec >= 1) {
      throw new Error('decreaseFactor must be in (0,1)');
    }
    this._limit = clamp(options.initialLimit ?? options.minLimit, this._min, this._max);
  }

  /** Current concurrency limit (integer permits). */
  get limit(): number {
    return Math.floor(this._limit);
  }

  metrics(): ThrottleMetrics {
    return { ...this._metrics };
  }

  /**
   * Admission check — does the current limit admit `inFlight` more?
   * Caller owns concurrency accounting; this class owns the limit signal.
   */
  admit(inFlight: number): boolean {
    const ok = inFlight < this.limit;
    if (ok) {
      this._metrics.admitted++;
    } else {
      this._metrics.rejected++;
    }
    return ok;
  }

  /** Records a success — grows the limit additively after `perInc` streak. */
  onSuccess(): void {
    this._successStreak++;
    if (this._successStreak >= this._perInc) {
      this._successStreak = 0;
      this._limit = Math.min(this._max, this._limit + this._inc);
    }
  }

  /** Records a failure — halves the limit, floor at min. Streak resets. */
  onFailure(): void {
    this._successStreak = 0;
    this._limit = Math.max(this._min, this._limit * this._dec);
  }

  /**
   * Runs `probe` under adaptive admission: if `admit` denies, rejects.
   * Otherwise runs the probe and feeds the outcome back into the limit.
   */
  async run<T>(inFlight: number, probe: () => Promise<T>): Promise<T> {
    if (!this.admit(inFlight)) {
      throw new Error('aimd: at adaptive concurrency limit');
    }
    try {
      const result = await probe();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
