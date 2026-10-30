/**
 * PenaltyEscalator — repeat-violator window escalation.
 *
 * Plain rate limiting punishes everyone equally — a first-time
 * offender and a persistent abuser get the same window. Escalation
 * makes the *window itself* a function of violation history: each
 * violation multiplies the next window's duration (default ×2),
 * capped at `maxWindowMs`. A client that keeps hitting the limit
 * ends up banned for minutes instead of seconds; a client that stops
 * decays back to clean after `resetAfterMs` of silence.
 *
 * State per key: `{ level, lastViolationAt }`. The effective window
 * at level L is `baseWindowMs × multiplier^L` (exponential — linear
 * escalation barely punishes and never converges on "ban").
 *
 * Decay is *level-at-once* after `resetAfterMs` — the alternative
 * (decay one level per quiet period) keeps a violator penalized for
 * a long tail, which is defensible but surprises operators; full-
 * reset after a clean window is the expected behaviour.
 *
 * Complexity: O(1) per record/lookup; state is two numbers per key.
 *
 * @module RateLimitingLayer/Engine
 */

import {
  ManualRateLimitClock,
  PenaltyOptions,
  PenaltyState,
  RateLimitClock,
  SystemRateLimitClock,
} from './types';

interface Violator {
  level: number;
  lastViolationAt: number;
}

export class PenaltyEscalator {
  private readonly _baseMs: number;
  private readonly _multiplier: number;
  private readonly _maxMs: number;
  private readonly _resetAfterMs: number;
  private readonly _clock: RateLimitClock;

  private _violators: Map<string, Violator>;

  constructor(options: PenaltyOptions) {
    if (options.baseWindowMs <= 0) {
      throw new RangeError('baseWindowMs must be > 0');
    }
    this._baseMs = options.baseWindowMs;
    this._multiplier = options.multiplier ?? 2;
    this._maxMs = options.maxWindowMs ?? 60 * 60_000; // 1h ceiling
    this._resetAfterMs = options.resetAfterMs ?? 10 * 60_000; // 10min clean
    this._clock = options.clock ?? new SystemRateLimitClock();
    this._violators = new Map();
  }

  /* ---------------------------------------------------------------- */
  /* Recording                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Record a violation for `key`. Returns the resulting state — the
   * caller uses `effectiveWindowMs` as the window for the *next*
   * request.
   */
  recordViolation(key: string): PenaltyState {
    const now = this._clock.now();
    let v = this._violators.get(key);

    // Clean period elapsed → level resets before counting this one.
    if (v && now - v.lastViolationAt > this._resetAfterMs) {
      v = undefined;
    }

    const level = (v?.level ?? 0) + 1;
    this._violators.set(key, { level, lastViolationAt: now });
    return this._stateOf(key);
  }

  /* ---------------------------------------------------------------- */
  /* Lookup                                                            */
  /* ---------------------------------------------------------------- */

  /** Current penalty state for `key` (clean when never violated). */
  state(key: string): PenaltyState {
    return this._stateOf(key);
  }

  /** Effective window for `key` — what the next request is judged by. */
  effectiveWindow(key: string): number {
    return this._stateOf(key).effectiveWindowMs;
  }

  /** Forgive a key (administrative reset). */
  forgive(key: string): void {
    this._violators.delete(key);
  }

  /** Drop violators whose clean period elapsed — O(keys). */
  sweep(): number {
    const now = this._clock.now();
    let n = 0;
    for (const [k, v] of this._violators) {
      if (now - v.lastViolationAt > this._resetAfterMs) {
        this._violators.delete(k);
        n++;
      }
    }
    return n;
  }

  get trackedKeys(): number {
    return this._violators.size;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _stateOf(key: string): PenaltyState {
    const now = this._clock.now();
    const v = this._violators.get(key);
    if (!v || now - v.lastViolationAt > this._resetAfterMs) {
      return { level: 0, effectiveWindowMs: this._baseMs, decaysInMs: 0 };
    }
    const effective = Math.min(
      this._baseMs * Math.pow(this._multiplier, v.level),
      this._maxMs
    );
    const decaysInMs = Math.max(0, v.lastViolationAt + this._resetAfterMs - now);
    return { level: v.level, effectiveWindowMs: effective, decaysInMs };
  }
}
