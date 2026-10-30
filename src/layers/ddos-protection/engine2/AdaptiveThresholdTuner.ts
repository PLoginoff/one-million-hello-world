/**
 * Adaptive Threshold Tuner
 *
 * Learns a normal-traffic baseline per metric and derives alert thresholds
 * from it, replacing hand-tuned static limits that go stale.
 *
 * Algorithm — exponentially-weighted baseline:
 *
 *   Each incoming window sample updates a running mean/variance via an
 *   EMA variant of Welford's algorithm:
 *
 *       α  = learnRate          (e.g. 0.1 — recent samples weigh ~10%)
 *       δ  = x - μ
 *       μ ← μ + α·δ
 *       v ← (1-α)·(v + α·δ²)     (EMA of squared deviation)
 *       σ  = √v
 *
 *   The EMA (vs. a sliding window mean) lets the baseline *track* genuine
 *   traffic growth — a site that doubles organically over a month won't be
 *   flagged, because μ follows it. This is the key property static limits
 *   and fixed-history z-scores lack.
 *
 *   Alert level = μ + sensitivity·σ, floored at minAbsolute so quiet
 *   services (μ≈σ≈0) still have a sane floor.
 *
 * Cold start: below `minSamples` the threshold reports `warm: false` —
 * callers should treat alerts as advisory, matching the permissive cold
 * start in SlidingWindowZScore.
 *
 * Complexity: O(1) per sample, O(1) memory per metric.
 *
 * @module DdosProtectionLayer/Engine2
 */

import {
  AdaptiveThreshold,
  BaselineMetric,
  IClock,
  SystemClock,
  ThresholdConfig,
  TrafficSample,
} from './types';

interface MetricState {
  mean: number;
  /** EMA variance accumulator. */
  m2: number;
  samples: number;
}

const DEFAULT_SENSITIVITY = 4;
const DEFAULT_MIN_SAMPLES = 12;
const DEFAULT_MIN_ABSOLUTE = 1;
const DEFAULT_LEARN_RATE = 0.1;

const ALL_METRICS: readonly BaselineMetric[] = [
  'requests',
  'bytes',
  'uniqueIps',
  'synCount',
  'l7Count',
  'errorRate',
];

export class AdaptiveThresholdTuner {
  private readonly _clock: IClock;
  private readonly _sensitivity: number;
  private readonly _minSamples: number;
  private readonly _minAbsolute: number;
  private readonly _alpha: number;
  private readonly _states = new Map<BaselineMetric, MetricState>();

  constructor(config: ThresholdConfig = {}, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._sensitivity = config.sensitivity ?? DEFAULT_SENSITIVITY;
    this._minSamples = config.minSamples ?? DEFAULT_MIN_SAMPLES;
    this._minAbsolute = config.minAbsolute ?? DEFAULT_MIN_ABSOLUTE;
    this._alpha = config.learnRate ?? DEFAULT_LEARN_RATE;
    if (this._alpha <= 0 || this._alpha > 1) {
      throw new RangeError('learnRate must be in (0, 1]');
    }
    for (const m of ALL_METRICS) {
      this._states.set(m, { mean: 0, m2: 0, samples: 0 });
    }
  }

  /**
   * Feed one aggregated window sample. The baseline is *only* updated by
   * samples deemed normal — call {@link observeAlerting} first and skip
   * learning from windows that are already anomalous, so attacks don't
   * train the baseline to accept them (classic poisoning defence).
   */
  learn(sample: TrafficSample): void {
    for (const m of ALL_METRICS) {
      this._update(m, this._extract(sample, m));
    }
  }

  /**
   * Evaluate a sample against the current thresholds *without* learning
   * from it. Returns the metrics whose values exceed their alert level —
   * an empty array means normal traffic (safe to {@link learn} from).
   */
  detect(sample: TrafficSample): { anomalous: BaselineMetric[]; worst: { metric: BaselineMetric; z: number } | null } {
    const anomalous: BaselineMetric[] = [];
    let worst: { metric: BaselineMetric; z: number } | null = null;

    for (const m of ALL_METRICS) {
      const t = this.threshold(m);
      if (!t.warm) continue; // cold baseline — advisory only
      const x = this._extract(sample, m);
      if (x > t.alertLevel) {
        anomalous.push(m);
        const z = t.stddev > 1e-9 ? (x - t.mean) / t.stddev : x - t.mean;
        if (!worst || z > worst.z) worst = { metric: m, z };
      }
    }
    return { anomalous, worst };
  }

  /**
   * Convenience: detect-then-learn in one call. Normal samples update the
   * baseline; anomalous ones do not (they'd poison it).
   */
  observe(sample: TrafficSample): { anomalous: BaselineMetric[]; learned: boolean } {
    const { anomalous } = this.detect(sample);
    if (anomalous.length === 0) {
      this.learn(sample);
      return { anomalous, learned: true };
    }
    return { anomalous, learned: false };
  }

  /** Current derived threshold for one metric. */
  threshold(metric: BaselineMetric): AdaptiveThreshold {
    const s = this._states.get(metric);
    if (!s) throw new RangeError(`unknown metric: ${metric}`);
    const stddev = Math.sqrt(Math.max(0, s.m2));
    const alertLevel = Math.max(this._minAbsolute, s.mean + this._sensitivity * stddev);
    return {
      metric,
      mean: s.mean,
      stddev,
      alertLevel,
      samples: s.samples,
      warm: s.samples >= this._minSamples,
    };
  }

  /** Snapshot of every tracked metric's threshold. */
  thresholds(): AdaptiveThreshold[] {
    return ALL_METRICS.map((m) => this.threshold(m));
  }

  /**
   * Force the baseline of a metric up/down — e.g. operator marks a planned
   * marketing blast so the tuner doesn't treat it as an attack.
   */
  adjust(metric: BaselineMetric, factor: number): void {
    const s = this._states.get(metric);
    if (!s) throw new RangeError(`unknown metric: ${metric}`);
    if (factor <= 0 || !Number.isFinite(factor)) {
      throw new RangeError('factor must be a positive finite number');
    }
    s.mean *= factor;
    s.m2 *= factor * factor; // σ scales linearly, variance quadratically
  }

  /** Forget all learned state (e.g. after a genuine traffic regime change). */
  reset(): void {
    for (const s of this._states.values()) {
      s.mean = 0;
      s.m2 = 0;
      s.samples = 0;
    }
  }

  /* ---------------------------------------------------------------- */

  private _update(metric: BaselineMetric, x: number): void {
    const s = this._states.get(metric)!;
    if (s.samples === 0) {
      // Seed the EMA at the first observation — otherwise μ crawls up
      // from 0 and a genuinely quiet start drags the baseline for
      // 1/α samples (e.g. α=0.1 → ~30 windows of bias).
      s.mean = x;
      s.m2 = 0;
      s.samples = 1;
      return;
    }
    const delta = x - s.mean;
    s.mean += this._alpha * delta;
    s.m2 = (1 - this._alpha) * (s.m2 + this._alpha * delta * delta);
    s.samples += 1;
  }

  private _extract(sample: TrafficSample, metric: BaselineMetric): number {
    switch (metric) {
      case 'requests':
        return sample.requests;
      case 'bytes':
        return sample.bytes;
      case 'uniqueIps':
        return sample.uniqueIps;
      case 'synCount':
        return sample.synCount;
      case 'l7Count':
        return sample.l7Count;
      case 'errorRate':
        return sample.requests > 0 ? sample.errorCount / sample.requests : 0;
    }
  }
}
