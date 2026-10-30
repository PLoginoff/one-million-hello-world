/**
 * HealthVerdict — continuous health score feeding breaker decisions.
 *
 * Binary breaker state (open/closed) is a coarse signal; a continuous
 * score in [0,1] gives dashboards and the auto-tuner a graded view:
 *
 *   score = EWMA of per-call health
 *     where each call contributes 1 (success+fast) or a degraded value:
 *       - failure          → 0
 *       - success + slow   → w_slow (default 0.5)
 *       - success + fast   → 1
 *
 * EWMA (α=0.2 default) means recent calls matter more and ancient
 * history fades without a window boundary cliff. The verdict exposes
 * thresholds: `healthy` when score ≥ healthyAt, `degraded` in the
 * band, `unhealthy` below `unhealthyAt` — so callers get a discrete
 * verdict *and* the raw score for trending.
 *
 * @module CircuitBreakerLayer/Engine
 */

import { BreakerEngineClock, SystemEngineClock } from './types';

export type VerdictLevel = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthVerdictOptions {
  /** EWMA smoothing factor (0,1]. Higher = reacts faster. Default 0.2. */
  alpha?: number;
  /** Contribution of a slow-but-successful call. Default 0.5. */
  slowWeight?: number;
  /** Latency above which a success counts as "slow" (ms). */
  slowThresholdMs?: number;
  /** Score ≥ this → 'healthy'. Default 0.8. */
  healthyAt?: number;
  /** Score < this → 'unhealthy'. Default 0.3. */
  unhealthyAt?: number;
  /** Initial score (0..1). Default 1.0 (assume healthy until proven). */
  initialScore?: number;
  clock?: BreakerEngineClock;
}

export interface Verdict {
  score: number;
  level: VerdictLevel;
  callsObserved: number;
  failures: number;
  slowCalls: number;
}

export class HealthVerdict {
  private readonly _clock: BreakerEngineClock;
  private readonly _alpha: number;
  private readonly _slowWeight: number;
  private readonly _slowThreshold: number;
  private readonly _healthyAt: number;
  private readonly _unhealthyAt: number;

  private _score: number;
  private _calls = 0;
  private _failures = 0;
  private _slowCalls = 0;
  private _lastUpdateAt = 0;

  constructor(options: HealthVerdictOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._alpha = options.alpha ?? 0.2;
    this._slowWeight = options.slowWeight ?? 0.5;
    this._slowThreshold = options.slowThresholdMs ?? Infinity;
    this._healthyAt = options.healthyAt ?? 0.8;
    this._unhealthyAt = options.unhealthyAt ?? 0.3;
    this._score = Math.max(0, Math.min(1, options.initialScore ?? 1.0));
    this._lastUpdateAt = this._clock.now();
    if (this._alpha <= 0 || this._alpha > 1) throw new Error('alpha must be in (0,1]');
    if (this._unhealthyAt >= this._healthyAt) throw new Error('unhealthyAt must be < healthyAt');
  }

  /** Record a call outcome. */
  record(success: boolean, latencyMs: number): void {
    let contribution: number;
    if (!success) {
      contribution = 0;
      this._failures++;
    } else if (latencyMs >= this._slowThreshold) {
      contribution = this._slowWeight;
      this._slowCalls++;
    } else {
      contribution = 1;
    }
    this._score = this._alpha * contribution + (1 - this._alpha) * this._score;
    this._calls++;
    this._lastUpdateAt = this._clock.now();
  }

  /** Current verdict (score + level). */
  verdict(): Verdict {
    return {
      score: this._score,
      level: this.level(),
      callsObserved: this._calls,
      failures: this._failures,
      slowCalls: this._slowCalls,
    };
  }

  level(): VerdictLevel {
    if (this._score >= this._healthyAt) return 'healthy';
    if (this._score < this._unhealthyAt) return 'unhealthy';
    return 'degraded';
  }

  get score(): number {
    return this._score;
  }

  /** Decay toward neutral over time with no calls — a quiet service drifts to 'degraded'. */
  decayToNeutral(neutral = 0.5, ratePerMinute = 0.1): void {
    const now = this._clock.now();
    const minutes = (now - this._lastUpdateAt) / 60_000;
    if (minutes <= 0) return;
    const decay = Math.pow(1 - ratePerMinute, minutes);
    this._score = neutral + (this._score - neutral) * decay;
    this._lastUpdateAt = now;
  }
}
