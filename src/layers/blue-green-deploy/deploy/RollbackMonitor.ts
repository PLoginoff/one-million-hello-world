/**
 * Blue-Green Deploy — Rollback Monitor
 *
 * Watches live-traffic metrics during and after a deployment and fires the
 * automatic rollback trigger when sustained badness is observed. Uses a
 * rolling window of (timestamp, errorRate, p99Latency) samples; the trigger
 * requires BOTH:
 *   - ≥ `minSamples` observations inside the window (avoids hair-trigger
 *     rollback on a single early sample), and
 *   - the window's aggregate error rate (errors/total across samples)
 *     exceeding the threshold.
 *
 * The monitor latches on fire: once triggered it reports shouldRollback until
 * `reset()` — a transient dip can't rescind a rollback already in flight.
 *
 * @module BlueGreenDeploy/Deploy
 */

import { BgClock, RollbackTrigger } from './BlueGreenTypes';

interface MetricSample {
  readonly at: number;
  readonly errors: number;
  readonly total: number;
  readonly p99LatencyMs: number;
}

export interface RollbackVerdict {
  readonly shouldRollback: boolean;
  readonly reason?: string;
  readonly observedErrorRate?: number;
  readonly observedP99Ms?: number;
  readonly samplesInWindow: number;
}

export class RollbackMonitor {
  private readonly _trigger: RollbackTrigger;
  private readonly _clock: BgClock;
  private _samples: MetricSample[] = [];
  private _tripped = false;
  private _tripReason = '';

  constructor(trigger: RollbackTrigger, clock: BgClock = Date.now) {
    if (!(trigger.errorRateThreshold >= 0 && trigger.errorRateThreshold <= 1)) {
      throw new RangeError('errorRateThreshold must be in [0,1]');
    }
    if (trigger.windowMs <= 0) throw new RangeError('windowMs must be positive');
    this._trigger = trigger;
    this._clock = clock;
  }

  get tripped(): boolean {
    return this._tripped;
  }

  /** Record a batch of observed request outcomes. O(1) amortized. */
  record(errors: number, total: number, p99LatencyMs: number): void {
    if (total <= 0) return;
    this._samples.push({ at: this._clock(), errors, total, p99LatencyMs });
    this._prune();
  }

  /** Record + evaluate — the common call path from the orchestrator. */
  recordAndEvaluate(errors: number, total: number, p99LatencyMs: number): RollbackVerdict {
    this.record(errors, total, p99LatencyMs);
    return this.evaluate();
  }

  evaluate(): RollbackVerdict {
    this._prune();
    const minSamples = this._trigger.minSamples ?? 1;

    if (this._tripped) {
      return {
        shouldRollback: true,
        reason: this._tripReason,
        samplesInWindow: this._samples.length,
      };
    }

    if (this._samples.length < minSamples) {
      return { shouldRollback: false, samplesInWindow: this._samples.length };
    }

    let errors = 0;
    let total = 0;
    let p99 = 0;
    for (const s of this._samples) {
      errors += s.errors;
      total += s.total;
      if (s.p99LatencyMs > p99) p99 = s.p99LatencyMs;
    }
    const errorRate = total > 0 ? errors / total : 0;
    const latencyBreach =
      this._trigger.latencyP99ThresholdMs !== undefined &&
      p99 > this._trigger.latencyP99ThresholdMs;

    if (errorRate > this._trigger.errorRateThreshold) {
      this._tripped = true;
      this._tripReason = `error rate ${(errorRate * 100).toFixed(2)}% > ${(
        this._trigger.errorRateThreshold * 100
      ).toFixed(2)}%`;
      return {
        shouldRollback: true,
        reason: this._tripReason,
        observedErrorRate: errorRate,
        observedP99Ms: p99,
        samplesInWindow: this._samples.length,
      };
    }
    if (latencyBreach) {
      this._tripped = true;
      this._tripReason = `p99 ${p99.toFixed(0)}ms > ${this._trigger.latencyP99ThresholdMs}ms`;
      return {
        shouldRollback: true,
        reason: this._tripReason,
        observedErrorRate: errorRate,
        observedP99Ms: p99,
        samplesInWindow: this._samples.length,
      };
    }
    return {
      shouldRollback: false,
      observedErrorRate: errorRate,
      observedP99Ms: p99,
      samplesInWindow: this._samples.length,
    };
  }

  reset(): void {
    this._samples = [];
    this._tripped = false;
    this._tripReason = '';
  }

  private _prune(): void {
    const cutoff = this._clock() - this._trigger.windowMs;
    let i = 0;
    while (i < this._samples.length && this._samples[i].at < cutoff) i++;
    if (i > 0) this._samples.splice(0, i);
  }
}
