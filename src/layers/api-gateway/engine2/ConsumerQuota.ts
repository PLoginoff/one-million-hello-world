/**
 * Per-Consumer Quota Tracker
 *
 * Fixed-window quota accounting: each consumer gets `limit` units per
 * `windowMs` aligned to the Unix epoch. Unlike a rate limiter (which
 * shapes bursts), a quota enforces cumulative consumption — a consumer
 * paying cost 5 spends the same budget whether those units arrive in
 * one call or fifty.
 *
 * Memory: one small record per active consumer; stale windows are
 * reset lazily on access and swept periodically via `sweep()`.
 *
 * Cost rounding: `charge` rounds each request up to the policy's
 * `unitSize` (e.g. KiB billing), so 1001 bytes in a 1KiB plan costs 2.
 *
 * @module ApiGatewayLayer/Engine2
 */

import {
  GatewayClock2,
  QuotaCheck,
  QuotaPolicy,
  SystemGatewayClock2,
} from './types';

interface WindowState {
  /** Start of the current window (epoch ms, aligned). */
  windowStart: number;
  /** Units spent inside the window. */
  used: number;
}

function windowStartFor(now: number, windowMs: number): number {
  return now - (now % windowMs);
}

export interface ConsumerQuotaOptions {
  readonly clock?: GatewayClock2;
  /** Optional global cap on tracked consumers (DoS guard). */
  readonly maxConsumers?: number;
}

export class QuotaExceededError extends Error {
  readonly check: QuotaCheck;
  constructor(consumerId: string, check: QuotaCheck) {
    super(`Quota exceeded for consumer '${consumerId}' (${check.used}/${check.limit})`);
    this.name = 'QuotaExceededError';
    this.check = check;
  }
}

export class ConsumerQuotaTracker {
  private readonly _clock: GatewayClock2;
  private readonly _policy: QuotaPolicy;
  private readonly _maxConsumers: number | undefined;
  private readonly _windows = new Map<string, WindowState>();

  constructor(policy: QuotaPolicy, options?: ConsumerQuotaOptions) {
    if (policy.limit <= 0) throw new Error('quota limit must be positive');
    if (policy.windowMs <= 0) throw new Error('quota windowMs must be positive');
    this._policy = {
      ...policy,
      unitSize: policy.unitSize && policy.unitSize > 0 ? policy.unitSize : 1,
    };
    this._clock = options?.clock ?? new SystemGatewayClock2();
    this._maxConsumers = options?.maxConsumers;
  }

  /** Units actually charged for a raw cost after unit rounding. */
  chargeable(rawCost: number): number {
    const unit = this._policy.unitSize ?? 1;
    return Math.max(unit, Math.ceil(rawCost / unit) * unit);
  }

  /** Look up (or lazily create/reset) the consumer's current window. */
  private stateFor(consumerId: string): WindowState {
    const start = windowStartFor(this._clock.now(), this._policy.windowMs);
    let st = this._windows.get(consumerId);
    if (!st) {
      if (this._maxConsumers !== undefined && this._windows.size >= this._maxConsumers) {
        this.sweep();
        if (this._windows.size >= this._maxConsumers) {
          throw new Error(`consumer cap reached (${this._maxConsumers})`);
        }
      }
      st = { windowStart: start, used: 0 };
      this._windows.set(consumerId, st);
    } else if (st.windowStart !== start) {
      st.windowStart = start;
      st.used = 0;
    }
    return st;
  }

  /**
   * Attempt to spend `rawCost` units for a consumer. Returns the check
   * result; when denied, `used` reflects pre-request spend and nothing
   * is debited (callers can use `chargeOrThrow` for the throwing form).
   */
  charge(consumerId: string, rawCost: number = 1): QuotaCheck {
    const st = this.stateFor(consumerId);
    const cost = this.chargeable(rawCost);
    const now = this._clock.now();
    const resetAt = st.windowStart + this._policy.windowMs;

    if (st.used + cost > this._policy.limit) {
      return {
        allowed: false,
        used: st.used,
        limit: this._policy.limit,
        resetAt,
        remaining: Math.max(0, this._policy.limit - st.used),
        retryAfterMs: resetAt - now,
      };
    }
    st.used += cost;
    return {
      allowed: true,
      used: st.used,
      limit: this._policy.limit,
      resetAt,
      remaining: this._policy.limit - st.used,
    };
  }

  chargeOrThrow(consumerId: string, rawCost: number = 1): QuotaCheck {
    const check = this.charge(consumerId, rawCost);
    if (!check.allowed) throw new QuotaExceededError(consumerId, check);
    return check;
  }

  /** Peek without spending — what would `rawCost` do? */
  preview(consumerId: string, rawCost: number = 1): QuotaCheck {
    const st = this.stateFor(consumerId);
    const cost = this.chargeable(rawCost);
    const now = this._clock.now();
    const resetAt = st.windowStart + this._policy.windowMs;
    const allowed = st.used + cost <= this._policy.limit;
    return {
      allowed,
      used: st.used,
      limit: this._policy.limit,
      resetAt,
      remaining: Math.max(0, this._policy.limit - st.used),
      retryAfterMs: allowed ? undefined : resetAt - now,
    };
  }

  /** Current usage without advancing or consuming anything. */
  usage(consumerId: string): { used: number; limit: number; resetAt: number } {
    const st = this.stateFor(consumerId);
    return {
      used: st.used,
      limit: this._policy.limit,
      resetAt: st.windowStart + this._policy.windowMs,
    };
  }

  /** Remove windows whose period has fully elapsed — bounds memory. */
  sweep(): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [id, st] of this._windows) {
      if (st.windowStart + this._policy.windowMs <= now) {
        this._windows.delete(id);
        removed++;
      }
    }
    return removed;
  }

  get trackedConsumers(): number {
    return this._windows.size;
  }

  /** Reset a single consumer (admin operation). */
  reset(consumerId: string): boolean {
    return this._windows.delete(consumerId);
  }
}
