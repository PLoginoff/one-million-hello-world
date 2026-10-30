/**
 * BurstCreditThrottle — bank unused capacity as spendable credits.
 *
 * Classic token bucket enforces a hard ceiling every window: at 100 rps,
 * a quiet minute buys nothing and a busy minute still caps at 100. Burst
 * credits change the contract: capacity not consumed in a window rolls
 * into a credit balance, so a key that's been quiet can burst past its
 * base limit for a while — same average throughput, better utilization.
 *
 * Mechanics (per key):
 *  - `baseLimit` requests per `windowMs` allowed at the base rate.
 *  - Each window, unused allowance converts at `accrualRate` into
 *    credits (e.g. 0.5 = keep half the slack), up to `maxCredits`.
 *  - Requests beyond the base allowance cost `cost` credits each;
 *    denied when both base tokens AND credits are exhausted.
 *  - Credits accrue lazily on access (no background job): on each
 *    evaluate we settle elapsed whole windows — O(1) per call.
 *
 * Optional `creditDecay` lets credits expire (`halfLifeMs`): each
 * settlement halves the balance per elapsed half-life, preventing
 * indefinite hoarding on dormant keys.
 *
 * Complexities: evaluate is O(1) amortized; memory O(#keys). Clock is
 * injectable for deterministic tests.
 *
 * @module ThrottlingLayer/Engine2
 */

import { ThrottleClock2, SystemThrottleClock2, ThrottleVerdict } from './types';

export interface BurstCreditOptions {
  /** Base allowed requests per window. */
  baseLimit: number;
  /** Window length in ms. */
  windowMs: number;
  /** Fraction of unused base capacity converted to credits each window
   *  (0-1]. Default 1 = full rollover. */
  accrualRate?: number;
  /** Credit balance cap. Default 5 × baseLimit. */
  maxCredits?: number;
  /** Credits needed per request above base. Default 1. */
  burstCost?: number;
  /** If set, credits decay with this half-life in ms (prevents hoarding). */
  halfLifeMs?: number;
  clock?: ThrottleClock2;
}

interface KeyState {
  /** Base tokens left in the current window. */
  baseTokens: number;
  /** Window start the current tokens belong to. */
  windowStart: number;
  /** Banked credits (can exceed maxCredits briefly before clamp). */
  credits: number;
  /** Last time credits were settled, for decay math. */
  lastSettleMs: number;
}

export class BurstCreditThrottle {
  private readonly _opts: Required<Omit<BurstCreditOptions, 'clock'>>;
  private readonly _clock: ThrottleClock2;
  private readonly _state = new Map<string, KeyState>();

  constructor(opts: BurstCreditOptions) {
    this._clock = opts.clock ?? new SystemThrottleClock2();
    if (opts.baseLimit <= 0) throw new Error('baseLimit must be > 0');
    if (opts.windowMs <= 0) throw new Error('windowMs must be > 0');
    this._opts = {
      baseLimit: opts.baseLimit,
      windowMs: opts.windowMs,
      accrualRate: Math.min(1, Math.max(0, opts.accrualRate ?? 1)),
      maxCredits: Math.max(0, opts.maxCredits ?? opts.baseLimit * 5),
      burstCost: Math.max(0, opts.burstCost ?? 1),
      halfLifeMs: Math.max(0, opts.halfLifeMs ?? 0),
    };
  }

  /**
   * Spend one request's worth of capacity for `key`.
   * Order: settle elapsed windows → base token → credits → deny.
   */
  evaluate(key: string): ThrottleVerdict {
    const now = this._clock.now();
    const st = this._settle(key, now);

    if (st.baseTokens > 0) {
      st.baseTokens--;
      return { allowed: true, decidedBy: 'base', remaining: st.baseTokens };
    }
    if (st.credits >= this._opts.burstCost) {
      st.credits -= this._opts.burstCost;
      return { allowed: true, decidedBy: 'credit', remaining: st.credits };
    }
    return {
      allowed: false,
      decidedBy: 'exhausted',
      reason: 'base tokens and burst credits exhausted',
      retryAfterMs: st.windowStart + this._opts.windowMs - now,
      remaining: 0,
    };
  }

  /** Current credit balance for a key (after lazy settlement). */
  credits(key: string): number {
    return this._settle(key, this._clock.now()).credits;
  }

  /** Remaining base tokens in the current window. */
  baseRemaining(key: string): number {
    return this._settle(key, this._clock.now()).baseTokens;
  }

  /**
   * Lazily settle elapsed whole windows for a key:
   *  1. Roll unused base tokens into credits at accrualRate (capped).
   *  2. Apply half-life decay for the elapsed time.
   *  3. Refill base tokens for the new window.
   *
   * Only whole windows accrue — a partially-elapsed window keeps its
   * tokens until it closes, so bursts can't starve the current window.
   */
  private _settle(key: string, now: number): KeyState {
    let st = this._state.get(key);
    const winStart = Math.floor(now / this._opts.windowMs) * this._opts.windowMs;
    if (!st) {
      st = {
        baseTokens: this._opts.baseLimit,
        windowStart: winStart,
        credits: 0,
        lastSettleMs: now,
      };
      this._state.set(key, st);
      return st;
    }

    const elapsedWindows = Math.floor((winStart - st.windowStart) / this._opts.windowMs);
    if (elapsedWindows > 0) {
      // The last recorded window banks its actual leftover; every window
      // before it was fully idle and banks the whole base allowance.
      const banked = (st.baseTokens + (elapsedWindows - 1) * this._opts.baseLimit) * this._opts.accrualRate;
      st.credits = Math.min(this._opts.maxCredits, st.credits + banked);
      st.baseTokens = this._opts.baseLimit;
      st.windowStart = winStart;
    }

    // Half-life decay on elapsed settle time (decays even within windows).
    if (this._opts.halfLifeMs > 0 && st.credits > 0) {
      const elapsed = now - st.lastSettleMs;
      if (elapsed > 0) {
        st.credits *= 0.5 ** (elapsed / this._opts.halfLifeMs);
        if (st.credits < 0.001) st.credits = 0;
      }
    }
    st.lastSettleMs = now;
    return st;
  }

  /** Number of tracked keys. */
  get keyCount(): number {
    return this._state.size;
  }
}
