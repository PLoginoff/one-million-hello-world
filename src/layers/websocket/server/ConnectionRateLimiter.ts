/**
 * ConnectionRateLimiter — per-connection inbound message rate limiting.
 *
 * Server-side WebSocket endpoints have no natural admission control: once
 * the upgrade succeeds, a client can blast messages as fast as TCP can
 * deliver them. This limiter is the first line of defense, sitting between
 * the session's `onMessage` callback and the application handler.
 *
 * Algorithm — token bucket with lazy refill:
 *
 * ```
 *   tokens(t) = min(capacity, tokens(t₀) + (t − t₀) · ratePerSec)
 *   admit if tokens(t) ≥ cost, else reject with retryAfterMs
 * ```
 *
 * The refill is computed on demand — no background timer — so a limiter
 * for an idle connection costs O(1) memory and zero CPU. `capacity`
 * doubles as the burst allowance; a peer may send `capacity` messages
 * instantly, then is throttled to the sustained `ratePerSec`.
 *
 * The limiter is deliberately *non-blocking*: WebSocket message handlers
 * are synchronous hot paths — rather than queue, we report `retryAfterMs`
 * so the router can punish abusive peers (warn → close with 1008).
 *
 * Also tracks a rolling violation count with exponential decay so a
 * "slow drip" of over-limit traffic is eventually treated the same as a
 * sustained burst — a single counter would never catch a peer that sends
 * 1 message over the limit every few seconds.
 *
 * Complexity: `admit` is O(1); memory is O(1) per instance.
 *
 * @module WebsocketLayer/Server
 */

/** Decision returned by {@link ConnectionRateLimiter.admit}. */
export interface RateLimitDecision {
  /** Whether the message may proceed to the application handler. */
  readonly allowed: boolean;
  /** Milliseconds until enough tokens refill to admit `cost` (0 when allowed). */
  readonly retryAfterMs: number;
  /** Tokens remaining after this decision (post-decrement if allowed). */
  readonly tokensRemaining: number;
  /** Decayed violation score — rises on each rejection, decays over time. */
  readonly violationScore: number;
}

export interface ConnectionRateLimiterOptions {
  /** Sustained messages per second the connection may send. */
  readonly ratePerSec: number;
  /** Bucket capacity — max burst size. Defaults to `ratePerSec`. */
  readonly capacity?: number;
  /**
   * Half-life (ms) of the violation score's exponential decay. A peer
   * whose last violation was one half-life ago has half the score.
   * Default 30_000.
   */
  readonly violationHalfLifeMs?: number;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => number;
}

/** Reason strings surfaced by {@link ConnectionRateLimiter.violationPolicy}. */
export enum ViolationAction {
  /** Score below `warnAt` — let the message through after rejection. */
  NONE = 'none',
  /** Score crossed `warnAt` — notify the client to slow down. */
  WARN = 'warn',
  /** Score crossed `closeAt` — terminate the connection (close 1008). */
  CLOSE = 'close',
}

export class ConnectionRateLimiter {
  private readonly _ratePerSec: number;
  private readonly _capacity: number;
  private readonly _halfLifeMs: number;
  private readonly _now: () => number;

  private _tokens: number;
  private _lastRefillAt: number;

  /** Exponentially-decayed abuse score, in "violation units". */
  private _violationScore = 0;
  private _lastViolationDecayAt: number;

  /** Lifetime counters for diagnostics. */
  private _admitted = 0;
  private _rejected = 0;

  constructor(options: ConnectionRateLimiterOptions) {
    if (options.ratePerSec <= 0) {
      throw new Error('ratePerSec must be > 0');
    }
    this._ratePerSec = options.ratePerSec;
    this._capacity = options.capacity ?? options.ratePerSec;
    this._halfLifeMs = options.violationHalfLifeMs ?? 30_000;
    this._now = options.now ?? (() => Date.now());
    this._tokens = this._capacity;
    this._lastRefillAt = this._now();
    this._lastViolationDecayAt = this._lastRefillAt;
  }

  /** Tokens currently available after lazy refill (fractional). */
  get availableTokens(): number {
    this._refill();
    return this._tokens;
  }

  /** Current decayed violation score. */
  get violationScore(): number {
    this._decayViolations();
    return this._violationScore;
  }

  get admitted(): number {
    return this._admitted;
  }

  get rejected(): number {
    return this._rejected;
  }

  /**
   * Try to admit one application message costing `cost` tokens.
   * On success the tokens are consumed immediately; on failure nothing is
   * consumed (the peer keeps its remaining allowance) but the violation
   * score is bumped by `cost`.
   */
  admit(cost = 1): RateLimitDecision {
    if (cost <= 0) {
      throw new Error('cost must be > 0');
    }
    this._refill();
    if (this._tokens >= cost) {
      this._tokens -= cost;
      this._admitted++;
      return {
        allowed: true,
        retryAfterMs: 0,
        tokensRemaining: this._tokens,
        violationScore: this.violationScore,
      };
    }
    const deficit = cost - this._tokens;
    const retryAfterMs = (deficit / this._ratePerSec) * 1000;
    this._rejected++;
    this._decayViolations();
    this._violationScore += cost;
    return {
      allowed: false,
      retryAfterMs,
      tokensRemaining: this._tokens,
      violationScore: this._violationScore,
    };
  }

  /**
   * Map the current violation score to an escalation action.
   * Thresholds are in decayed violation units: `warnAt` should be a few
   * rejected messages' worth; `closeAt` a sustained-abuse level.
   */
  violationPolicy(warnAt: number, closeAt: number): ViolationAction {
    const score = this.violationScore;
    if (score >= closeAt) return ViolationAction.CLOSE;
    if (score >= warnAt) return ViolationAction.WARN;
    return ViolationAction.NONE;
  }

  /** Reset both the bucket and the violation history (e.g. after auth upgrade). */
  reset(): void {
    this._tokens = this._capacity;
    this._lastRefillAt = this._now();
    this._violationScore = 0;
    this._lastViolationDecayAt = this._lastRefillAt;
    this._admitted = 0;
    this._rejected = 0;
  }

  /** Lazy accrual — tokens += rate · elapsed, capped at capacity. */
  private _refill(): void {
    const now = this._now();
    const elapsedSec = (now - this._lastRefillAt) / 1000;
    if (elapsedSec > 0) {
      this._tokens = Math.min(this._capacity, this._tokens + elapsedSec * this._ratePerSec);
      this._lastRefillAt = now;
    }
  }

  /**
   * Exponential decay of the violation score:
   *   score(t) = score(t₀) · 2 ^ (−(t − t₀) / halfLife)
   * Decaying lazily keeps `admit`/`violationScore` O(1) — we store only
   * the score and its last-decay timestamp.
   */
  private _decayViolations(): void {
    const now = this._now();
    const elapsed = now - this._lastViolationDecayAt;
    if (elapsed > 0 && this._violationScore > 0) {
      this._violationScore *= Math.pow(2, -elapsed / this._halfLifeMs);
      // Snap tiny residues to zero to avoid floating-point tail dust.
      if (this._violationScore < 1e-6) this._violationScore = 0;
      this._lastViolationDecayAt = now;
    }
  }
}
