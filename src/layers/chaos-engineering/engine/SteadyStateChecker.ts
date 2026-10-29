/**
 * Chaos Engineering — Steady-State Hypothesis Checker
 *
 * Samples probes before/during/after an experiment and evaluates each probe's
 * observations against a {@link Tolerance}. Supports both absolute tolerances
 * and baseline-relative tolerances (within ±Δ or ±% of the pre-experiment
 * baseline mean).
 *
 * Statistics
 * ----------
 * For each probe we keep a running Welford accumulator (mean, M2) so the
 * observed value reported in verdicts is the sample mean and we can also
 * expose the sample standard deviation — both O(1) per sample, O(1) memory.
 * Baseline-relative tolerances resolve the baseline as the mean of the
 * baseline-phase samples for the same probe.
 *
 * @module ChaosEngineering/Engine
 */

import {
  ChaosClock,
  ProbeSample,
  ProbeVerdict,
  SteadyStateProbe,
  Tolerance,
  ToleranceKind,
} from './ChaosEngineTypes';

/** Phase a sample was taken in — drives baseline capture. */
export enum SamplePhase {
  BASELINE = 'baseline',
  DURING = 'during',
  AFTER = 'after',
}

interface PhaseSamples {
  baseline: number[];
  during: number[];
  after: number[];
}

/**
 * Welford online mean/variance accumulator.
 * @see https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm
 */
export class WelfordAccumulator {
  private _n = 0;
  private _mean = 0;
  private _m2 = 0;

  get count(): number {
    return this._n;
  }
  get mean(): number {
    return this._mean;
  }
  /** Population variance (divide by n). */
  get variance(): number {
    return this._n > 0 ? this._m2 / this._n : 0;
  }
  /** Sample variance (divide by n-1); 0 when fewer than 2 samples. */
  get sampleVariance(): number {
    return this._n > 1 ? this._m2 / (this._n - 1) : 0;
  }
  get stddev(): number {
    return Math.sqrt(this.sampleVariance);
  }

  add(x: number): void {
    this._n++;
    const delta = x - this._mean;
    this._mean += delta / this._n;
    const delta2 = x - this._mean;
    this._m2 += delta * delta2;
  }

  merge(other: WelfordAccumulator): void {
    if (other._n === 0) return;
    if (this._n === 0) {
      this._n = other._n;
      this._mean = other._mean;
      this._m2 = other._m2;
      return;
    }
    const delta = other._mean - this._mean;
    const total = this._n + other._n;
    this._m2 += other._m2 + (delta * delta * this._n * other._n) / total;
    this._mean = (this._mean * this._n + other._mean * other._n) / total;
    this._n = total;
  }
}

export class SteadyStateChecker {
  private readonly _probes: Map<string, SteadyStateProbe> = new Map();
  private readonly _samples: Map<string, PhaseSamples> = new Map();
  private readonly _clock: ChaosClock;
  private readonly _rawLog: ProbeSample[] = [];

  constructor(clock: ChaosClock = Date.now) {
    this._clock = clock;
  }

  registerProbe(probe: SteadyStateProbe): void {
    if (this._probes.has(probe.name)) {
      throw new Error(`probe '${probe.name}' already registered`);
    }
    this._probes.set(probe.name, probe);
    this._samples.set(probe.name, { baseline: [], during: [], after: [] });
  }

  unregisterProbe(name: string): boolean {
    this._samples.delete(name);
    return this._probes.delete(name);
  }

  get probeNames(): ReadonlyArray<string> {
    return [...this._probes.keys()];
  }

  /** All raw samples (with probe name + timestamp), for report generation. */
  get sampleLog(): ReadonlyArray<ProbeSample> {
    return this._rawLog;
  }

  /**
   * Take one sample of every registered probe for the given phase.
   * Probes whose sampler throws contribute no sample (failure recorded via
   * absence — a crashed sampler means "could not verify", which fails closed
   * at verdict time when minSamples is unmet).
   */
  async sampleAll(phase: SamplePhase): Promise<ReadonlyArray<ProbeSample>> {
    const taken: ProbeSample[] = [];
    for (const probe of this._probes.values()) {
      const s = await this.sample(probe.name, phase);
      if (s) taken.push(s);
    }
    return taken;
  }

  /** Take one sample of a single probe. Returns null when the sampler throws. */
  async sample(probeName: string, phase: SamplePhase): Promise<ProbeSample | null> {
    const probe = this._probes.get(probeName);
    if (!probe) {
      throw new Error(`unknown probe '${probeName}'`);
    }
    let value: number;
    try {
      value = await probe.sample();
    } catch {
      return null;
    }
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    const s: ProbeSample = { probeName, value, at: this._clock() };
    const bucket = this._samples.get(probeName);
    if (bucket) {
      switch (phase) {
        case SamplePhase.BASELINE:
          bucket.baseline.push(value);
          break;
        case SamplePhase.DURING:
          bucket.during.push(value);
          break;
        case SamplePhase.AFTER:
          bucket.after.push(value);
          break;
      }
    }
    this._rawLog.push(s);
    return s;
  }

  /**
   * Evaluate a single probe. The observed value is the mean of `during`
   * samples (falling back to `after` then `baseline` when during-phase data
   * is absent). Baseline-relative tolerances resolve against the baseline mean.
   */
  evaluate(probeName: string): ProbeVerdict {
    const probe = this._probes.get(probeName);
    const bucket = this._samples.get(probeName);
    if (!probe || !bucket) {
      throw new Error(`unknown probe '${probeName}'`);
    }

    const during = new WelfordAccumulator();
    bucket.during.forEach((v) => during.add(v));
    const baseline = new WelfordAccumulator();
    bucket.baseline.forEach((v) => baseline.add(v));
    const after = new WelfordAccumulator();
    bucket.after.forEach((v) => after.add(v));

    const sampleCount = bucket.during.length + bucket.after.length + bucket.baseline.length;
    if (sampleCount < probe.minSamples) {
      return {
        probeName,
        passed: false,
        samples: sampleCount,
        observedValue: Number.NaN,
        reason: `insufficient samples: ${sampleCount}/${probe.minSamples} required`,
      };
    }

    // Prefer during-phase observations; fall back so verdicts are still
    // computable for experiments that only probed pre/post.
    const observed =
      bucket.during.length > 0
        ? during.mean
        : bucket.after.length > 0
          ? after.mean
          : baseline.mean;

    const ok = this._checkTolerance(observed, probe.tolerance, baseline.mean, bucket.baseline.length > 0);
    return {
      probeName,
      passed: ok,
      samples: sampleCount,
      observedValue: observed,
      reason: ok
        ? `observed ${observed.toFixed(4)} satisfies tolerance`
        : `observed ${observed.toFixed(4)} violates ${probe.tolerance.kind} tolerance`,
    };
  }

  /** Evaluate every registered probe; the hypothesis holds iff all pass. */
  evaluateAll(): { held: boolean; verdicts: ReadonlyArray<ProbeVerdict> } {
    const verdicts: ProbeVerdict[] = [];
    let held = true;
    for (const name of this._probes.keys()) {
      const v = this.evaluate(name);
      verdicts.push(v);
      if (!v.passed) held = false;
    }
    return { held, verdicts };
  }

  /**
   * Two-sample Welch t-test between baseline and during samples for a probe.
   * Returns { t, df, significant } where `significant` uses the |t| > 2 rule
   * of thumb (≈ p < 0.05 for moderate df) — deliberately dependency-free.
   * Requires ≥2 samples in each phase or returns null.
   */
  compareBaselineVsDuring(probeName: string): { t: number; df: number; significant: boolean } | null {
    const bucket = this._samples.get(probeName);
    if (!bucket || bucket.baseline.length < 2 || bucket.during.length < 2) {
      return null;
    }
    const a = new WelfordAccumulator();
    bucket.baseline.forEach((v) => a.add(v));
    const b = new WelfordAccumulator();
    bucket.during.forEach((v) => b.add(v));

    const va = a.sampleVariance;
    const vb = b.sampleVariance;
    const na = a.count;
    const nb = b.count;
    const se = Math.sqrt(va / na + vb / nb);
    if (se === 0) {
      return { t: a.mean === b.mean ? 0 : Number.POSITIVE_INFINITY, df: na + nb - 2, significant: a.mean !== b.mean };
    }
    const t = (b.mean - a.mean) / se;
    // Welch–Satterthwaite degrees of freedom.
    const num = (va / na + vb / nb) ** 2;
    const den = (va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1);
    const df = den > 0 ? num / den : na + nb - 2;
    return { t, df, significant: Math.abs(t) > 2 };
  }

  /** Reset all sample state (probes stay registered). */
  reset(): void {
    for (const bucket of this._samples.values()) {
      bucket.baseline.length = 0;
      bucket.during.length = 0;
      bucket.after.length = 0;
    }
    this._rawLog.length = 0;
  }

  // ------------------------------------------------------------------ private

  private _checkTolerance(
    observed: number,
    tol: Tolerance,
    baselineMean: number,
    hasBaseline: boolean
  ): boolean {
    switch (tol.kind) {
      case ToleranceKind.AT_MOST:
        return observed <= (tol.threshold ?? Number.POSITIVE_INFINITY);
      case ToleranceKind.AT_LEAST:
        return observed >= (tol.threshold ?? Number.NEGATIVE_INFINITY);
      case ToleranceKind.WITHIN_ABSOLUTE: {
        if (!hasBaseline) return false;
        return Math.abs(observed - baselineMean) <= (tol.absoluteDelta ?? 0);
      }
      case ToleranceKind.WITHIN_PERCENT: {
        if (!hasBaseline) return false;
        const pct = tol.percent ?? 0;
        const lo = baselineMean * (1 - pct);
        const hi = baselineMean * (1 + pct);
        return observed >= Math.min(lo, hi) && observed <= Math.max(lo, hi);
      }
      case ToleranceKind.IN_RANGE:
        return observed >= (tol.min ?? Number.NEGATIVE_INFINITY) && observed <= (tol.max ?? Number.POSITIVE_INFINITY);
    }
  }
}
