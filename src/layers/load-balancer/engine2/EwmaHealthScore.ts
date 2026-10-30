/**
 * EwmaHealthScore — percentage-based outlier detection over an EWMA of
 * request success, complementing consecutive-failure ejection.
 *
 * Consecutive-failure detection is blind to "50% flappy" backends that
 * never fail enough in a row. This tracker keeps an exponentially
 * weighted moving average of per-request success (1 = ok, 0 = fail):
 *
 *   score_t = α·x_t + (1−α)·score_{t−1}
 *
 * Instead of a fixed α we use a *time-decayed* EWMA (like Envoy's
 * EWMA latency and Netflix's choice): each sample is weighted by
 * `2^(-Δt/halflifeMs)` so stale data fades — a backend idle for a long
 * period is judged mostly on fresh evidence:
 *
 *   score_t = (score_{t−1}·decay + x_t) / (decay + 1)     [running]
 *
 * A backend whose score falls below `minSuccessRate` *after* at least
 * `minSamples` is flagged unhealthy — "percentage ejection" vs the
 * consecutive variant in OutlierDetector.
 *
 * Complexity: O(1) per observation, O(1) per score query.
 *
 * @module LoadBalancerLayer/Engine2
 */

import { LbClock2, SystemLbClock2 } from './types';

export interface EwmaHealthOptions {
  /** Half-life of old observations in ms. Default 10_000. */
  halflifeMs?: number;
  /** Score below this (after minSamples) → unhealthy. Default 0.7. */
  minSuccessRate?: number;
  /** Minimum weighted samples before judging. Default 10. */
  minSamples?: number;
  clock?: LbClock2;
}

interface Score {
  /** Weighted sum of successes. */
  num: number;
  /** Weighted sample count (denominator). */
  den: number;
  /** Timestamp of the last observation (decay anchor). */
  lastAtMs: number;
}

export class EwmaHealthScore {
  private readonly _halflife: number;
  private readonly _minRate: number;
  private readonly _minSamples: number;
  private readonly _clock: LbClock2;
  private readonly _scores = new Map<string, Score>();

  constructor(opts: EwmaHealthOptions = {}) {
    this._halflife = Math.max(1, opts.halflifeMs ?? 10_000);
    this._minRate = opts.minSuccessRate ?? 0.7;
    if (this._minRate <= 0 || this._minRate >= 1) {
      throw new RangeError('minSuccessRate must be in (0, 1)');
    }
    this._minSamples = Math.max(1, opts.minSamples ?? 10);
    this._clock = opts.clock ?? new SystemLbClock2();
  }

  /** Observe one request outcome. */
  observe(backendId: string, ok: boolean): void {
    const now = this._clock.now();
    let s = this._scores.get(backendId);
    if (!s) {
      s = { num: 0, den: 0, lastAtMs: now };
      this._scores.set(backendId, s);
    }
    const decay = this._decay(now - s.lastAtMs);
    s.num = s.num * decay + (ok ? 1 : 0);
    s.den = s.den * decay + 1;
    s.lastAtMs = now;
  }

  /**
   * Current success score in [0,1]. Time since the last observation
   * decays BOTH numerator and denominator equally, so the ratio is
   * stable under idleness — score only moves when new evidence arrives.
   */
  score(backendId: string): number {
    const s = this._scores.get(backendId);
    if (!s || s.den <= 0) return 1;
    return s.num / s.den;
  }

  /** Weighted sample count — how much evidence backs the score. */
  sampleWeight(backendId: string): number {
    const s = this._scores.get(backendId);
    if (!s) return 0;
    // Apply pending decay so idle staleness shrinks the evidence weight.
    return s.den * this._decay(this._clock.now() - s.lastAtMs);
  }

  /**
   * Is the backend healthy? True unless it has accumulated at least
   * `minSamples` of (decayed) evidence AND its score is below threshold.
   */
  isHealthy(backendId: string): boolean {
    const s = this._scores.get(backendId);
    if (!s) return true;
    if (this.sampleWeight(backendId) < this._minSamples) return true;
    return this.score(backendId) >= this._minRate;
  }

  /** Ids of all tracked backends currently judged unhealthy. */
  unhealthy(): string[] {
    const out: string[] = [];
    for (const id of this._scores.keys()) {
      if (!this.isHealthy(id)) out.push(id);
    }
    return out;
  }

  reset(backendId: string): void {
    this._scores.delete(backendId);
  }

  private _decay(deltaMs: number): number {
    if (deltaMs <= 0) return 1;
    return Math.pow(0.5, deltaMs / this._halflife);
  }
}
