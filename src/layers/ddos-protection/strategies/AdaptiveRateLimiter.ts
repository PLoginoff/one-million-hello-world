/**
 * AdaptiveRateLimiter
 *
 * Per-source token buckets whose refill rate adapts to **global** load:
 *
 *   - Under normal load: all sources get `baseRatePerSec` tokens/sec.
 *   - When total event rate crosses `loadThreshold`, the shared refill rate
 *     is multiplied by `backoffFactor` per adaptation step, floored at
 *     `minRatePerSec`.
 *   - When load drops, the shared rate recovers additively toward the base.
 *
 * This is the AIMD scheme (additive increase, multiplicative decrease) from
 * TCP congestion control: fair under normal load, sharply protective under
 * attack. The rate is global — every source sees the same adapted cap,
 * which is what you want when the backend is being saturated regardless of
 * which IPs are responsible.
 *
 * O(1) per event, O(1) per tick. Buckets are lazily refilled on access.
 *
 * @module DdosProtectionLayer/Strategies
 */

import { DetectionResult, IDetector, TrafficEvent, allow, verdict } from '../types/traffic';

export interface AdaptiveRateLimiterConfig {
  /** Base token rate per second per source. Default 100. */
  baseRatePerSec?: number;
  /** Floor for the adapted rate. Default baseRate/10. */
  minRatePerSec?: number;
  /** Burst capacity (max tokens). Default 2× baseRatePerSec. */
  burstCapacity?: number;
  /** Global events/sec at which adaptation kicks in. Default 10_000. */
  loadThreshold?: number;
  /** Multiplicative decrease factor per step (0<f<1). Default 0.5. */
  backoffFactor?: number;
  /** Additive recovery step (events/sec) per quiet window. Default 10% of base. */
  recoveryStepPerSec?: number;
  /** Window length (ms) for global-rate measurement. Default 1000. */
  globalWindowMs?: number;
}

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

export class AdaptiveRateLimiter implements IDetector {
  readonly name = 'adaptive-rate-limiter';

  private readonly _cfg: Required<AdaptiveRateLimiterConfig>;
  private readonly _buckets: Map<string, Bucket>;
  private readonly _globalWindow: number[];
  private _lastAdaptAt: number;
  private _lastAdaptRate: number;
  private _effectiveRate: number;

  constructor(config: AdaptiveRateLimiterConfig = {}) {
    const base = config.baseRatePerSec ?? 100;
    this._cfg = {
      baseRatePerSec: base,
      minRatePerSec: config.minRatePerSec ?? Math.max(1, base / 10),
      burstCapacity: config.burstCapacity ?? base * 2,
      loadThreshold: config.loadThreshold ?? 10_000,
      backoffFactor: config.backoffFactor ?? 0.5,
      recoveryStepPerSec: config.recoveryStepPerSec ?? base * 0.1,
      globalWindowMs: config.globalWindowMs ?? 1000,
    };
    this._buckets = new Map();
    this._globalWindow = [];
    this._lastAdaptAt = 0;
    this._lastAdaptRate = 0;
    this._effectiveRate = this._cfg.baseRatePerSec;
  }

  inspect(event: TrafficEvent): DetectionResult {
    // Compute load *before* recording this event so a burst doesn't mask
    // itself in the adaptation window.
    this._adapt(event.at);
    this._recordGlobal(event.at);

    const b = this._bucketFor(event.srcIp, event.at);
    this._refill(b, event.at);

    if (b.tokens >= 1) {
      b.tokens -= 1;
      return allow([`tokens:${b.tokens.toFixed(1)}`]);
    }
    return verdict('rate-limit', 0.6, [
      `rate-exceeded:${this._effectiveRate.toFixed(1)}/s`,
    ], { tokens: b.tokens, rate: this._effectiveRate });
  }

  /** Force an adaptation check (admin/test). */
  tick(now: number = Date.now()): void {
    this._adapt(now);
  }

  reset(): void {
    this._buckets.clear();
    this._globalWindow.length = 0;
    this._effectiveRate = this._cfg.baseRatePerSec;
  }

  /** Current effective per-source rate (shared by all sources). */
  effectiveRate(_srcIp?: string): number {
    return this._effectiveRate;
  }

  /** Global measured rate (events/sec) in the last window. */
  globalRate(now: number = Date.now()): number {
    const cutoff = now - this._cfg.globalWindowMs;
    while (this._globalWindow.length > 0 && this._globalWindow[0] < cutoff) {
      this._globalWindow.shift();
    }
    return (this._globalWindow.length * 1000) / this._cfg.globalWindowMs;
  }

  // -------------------------------------------------------------------------

  private _recordGlobal(now: number): void {
    this._globalWindow.push(now);
  }

  /**
   * AIMD adaptation of the shared rate:
   *  - multiplicative decrease when measured load exceeds the threshold
   *  - additive increase when it doesn't
   */
  private _adapt(now: number): void {
    if (now - this._lastAdaptAt < this._cfg.globalWindowMs) {
      return;
    }
    const rate = this.globalRate(now);
    this._lastAdaptAt = now;
    this._lastAdaptRate = rate;
    if (rate > this._cfg.loadThreshold) {
      this._effectiveRate = Math.max(
        this._cfg.minRatePerSec,
        this._effectiveRate * this._cfg.backoffFactor
      );
    } else {
      this._effectiveRate = Math.min(
        this._cfg.baseRatePerSec,
        this._effectiveRate + this._cfg.recoveryStepPerSec
      );
    }
  }

  private _bucketFor(ip: string, now: number): Bucket {
    let b = this._buckets.get(ip);
    if (!b) {
      b = { tokens: this._cfg.burstCapacity, lastRefillAt: now };
      this._buckets.set(ip, b);
    }
    return b;
  }

  private _refill(b: Bucket, now: number): void {
    if (now <= b.lastRefillAt) {
      return;
    }
    const dtSec = (now - b.lastRefillAt) / 1000;
    b.tokens = Math.min(this._cfg.burstCapacity, b.tokens + dtSec * this._effectiveRate);
    b.lastRefillAt = now;
  }
}
