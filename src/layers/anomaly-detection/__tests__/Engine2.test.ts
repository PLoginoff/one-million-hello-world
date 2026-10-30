/**
 * Anomaly Detection Engine 2 tests — Welford online z-score, ensemble
 * voting, drift adaptation, feature explanation, P² threshold tuning.
 */

import { describe, expect, it } from 'bun:test';
import { OnlineZScoreDetector, WelfordEstimator } from '../engine2/Welford';
import { EnsembleDetector, DetectorAdapter, IScoringDetector, toAnomaly } from '../engine2/Ensemble';
import { ConceptDriftAdapter, IDriftMonitor } from '../engine2/DriftAdaptation';
import { ZScoreExplainer, LeaveOneOutExplainer } from '../engine2/Explainer';
import { P2Quantile, ThresholdTuner } from '../engine2/ThresholdTuner';
import { MedianMadDetector, RingBuffer } from '../engine2/RobustStats';
import { MovingAverageDetector, EwmaDetector } from '../implementations/detectors/StreamingDetectors';
import { DataPoint } from '../implementations/detectors/Types';

/** Deterministic gaussian-ish samples via a seeded LCG + Box-Muller. */
function* gaussian(seed: number, mean = 0, sd = 1): Generator<number, never> {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  while (true) {
    const u1 = Math.max(1e-12, rand());
    const u2 = rand();
    yield mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/* ---------------------------------------------------------------------- */
/* Welford                                                                */
/* ---------------------------------------------------------------------- */

describe('WelfordEstimator', () => {
  it('matches batch mean/variance', () => {
    const est = new WelfordEstimator();
    const data = [4, 8, 15, 16, 23, 42];
    for (const x of data) est.add(x);
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const varr = data.reduce((a, b) => a + (b - mean) ** 2, 0) / (data.length - 1);
    expect(est.mean).toBeCloseTo(mean, 10);
    expect(est.variance).toBeCloseTo(varr, 10);
  });

  it('merge equals joint statistics', () => {
    const a = new WelfordEstimator();
    const b = new WelfordEstimator();
    const dataA = [1, 2, 3, 4, 5];
    const dataB = [10, 11, 12, 13, 14, 15];
    for (const x of dataA) a.add(x);
    for (const x of dataB) b.add(x);
    a.merge(b);
    const all = [...dataA, ...dataB];
    const mean = all.reduce((x, y) => x + y, 0) / all.length;
    const varr = all.reduce((x, y) => x + (y - mean) ** 2, 0) / (all.length - 1);
    expect(a.mean).toBeCloseTo(mean, 8);
    expect(a.variance).toBeCloseTo(varr, 8);
  });

  it('decay forgets old data', () => {
    const est = new WelfordEstimator(0.5);
    for (let i = 0; i < 20; i++) est.add(0);
    for (let i = 0; i < 10; i++) est.add(10);
    // With decay 0.5, the recent 10s dominate → mean near 10.
    expect(est.mean).toBeGreaterThan(7);
  });
});

describe('OnlineZScoreDetector', () => {
  it('flags an outlier in a stable stream', () => {
    const d = new OnlineZScoreDetector({ warmup: 10, threshold: 3 });
    const g = gaussian(7, 50, 2);
    let flagged = false;
    for (let i = 0; i < 200; i++) d.update(g.next().value);
    const r = d.update(200); // massive outlier
    expect(r.isAnomaly).toBe(true);
    expect(r.z).toBeGreaterThan(3);
    expect(flagged).toBe(false);
  });

  it('does not flag normal points', () => {
    const d = new OnlineZScoreDetector({ warmup: 10, threshold: 5 });
    const g = gaussian(11, 0, 1);
    let alarms = 0;
    for (let i = 0; i < 500; i++) {
      if (d.update(g.next().value).isAnomaly) alarms++;
    }
    // At z>5 on gaussian data, expect ~0 alarms.
    expect(alarms).toBeLessThan(3);
  });

  it('does not flag during warmup', () => {
    const d = new OnlineZScoreDetector({ warmup: 50 });
    const g = gaussian(3);
    let flagged = 0;
    for (let i = 0; i < 50; i++) {
      if (d.update(g.next().value * 1000).isAnomaly) flagged++;
    }
    expect(flagged).toBe(0);
  });

  it('zero-variance stream flags any deviation', () => {
    const d = new OnlineZScoreDetector({ warmup: 3 });
    d.update(5);
    d.update(5);
    d.update(5);
    const r = d.update(6);
    expect(r.isAnomaly).toBe(true);
  });

  it('peek does not mutate state', () => {
    const d = new OnlineZScoreDetector({ warmup: 2 });
    d.update(1);
    d.update(2);
    const before = d.estimator.snapshot();
    d.peek(999);
    const after = d.estimator.snapshot();
    expect(after.n).toBe(before.n);
    expect(after.mean).toBe(before.mean);
  });
});

/* ---------------------------------------------------------------------- */
/* Robust stats                                                           */
/* ---------------------------------------------------------------------- */

describe('MedianMadDetector', () => {
  it('flags an outlier the mean would mask', () => {
    const d = new MedianMadDetector({ window: 30, warmup: 10 });
    // Stable stream around 50
    for (let i = 0; i < 25; i++) d.update(50 + (i % 3) - 1);
    // Several big outliers contaminate the stream — median is robust.
    const r = d.update(500);
    expect(r.isAnomaly).toBe(true);
    expect(r.median).toBeCloseTo(50, 0);
  });

  it('does not flag normal fluctuation', () => {
    const d = new MedianMadDetector({ window: 30, warmup: 10 });
    const g = gaussian(13, 100, 2);
    let alarms = 0;
    for (let i = 0; i < 200; i++) {
      if (d.update(g.next().value).isAnomaly) alarms++;
    }
    expect(alarms).toBeLessThan(5);
  });
});

describe('RingBuffer', () => {
  it('overwrites oldest at capacity', () => {
    const r = new RingBuffer(3);
    r.push(1); r.push(2); r.push(3); r.push(4);
    expect(r.size).toBe(3);
    expect(r.sorted()).toEqual([2, 3, 4]);
  });
});

/* ---------------------------------------------------------------------- */
/* Ensemble                                                               */
/* ---------------------------------------------------------------------- */

class ConstantScorer implements IScoringDetector {
  readonly name: string;
  private s: number;
  constructor(name: string, s: number) {
    this.name = name;
    this.s = s;
  }
  score(): number {
    return this.s;
  }
  reset(): void {}
}

describe('EnsembleDetector', () => {
  const pt = (v: number): DataPoint => ({ timestamp: 0, value: v });

  it('computes weighted mean of normalized scores', () => {
    const e = new EnsembleDetector({ threshold: 0.5 });
    e.addMember(new ConstantScorer('a', 1), 1);
    e.addMember(new ConstantScorer('b', 0.5), 1);
    const r = e.update(pt(0));
    expect(r.combined).toBeCloseTo(0.75);
    expect(r.isAnomaly).toBe(true);
  });

  it('weights shift the combined score', () => {
    const e = new EnsembleDetector({ threshold: 0.5 });
    e.addMember(new ConstantScorer('loud', 1), 1);
    e.addMember(new ConstantScorer('quiet', 0), 3); // quiet dominates
    const r = e.update(pt(0));
    expect(r.combined).toBeCloseTo(0.25);
    expect(r.isAnomaly).toBe(false);
  });

  it('enforces quorum', () => {
    const e = new EnsembleDetector({ threshold: 0.3, minQuorum: 0.6 });
    e.addMember(new ConstantScorer('a', 1), 1, 0.5);
    e.addMember(new ConstantScorer('b', 0.8), 1, 0.5);
    e.addMember(new ConstantScorer('c', 0), 1, 0.5);
    const r = e.update(pt(0));
    expect(r.combined).toBeCloseTo(0.6);
    expect(r.quorum).toBeCloseTo(2 / 3);
    expect(r.isAnomaly).toBe(true);
  });

  it('quorum failure blocks anomaly even with high combined', () => {
    const e = new EnsembleDetector({ threshold: 0.3, minQuorum: 0.8 });
    e.addMember(new ConstantScorer('a', 1), 1, 1);
    e.addMember(new ConstantScorer('b', 0), 1, 1);
    e.addMember(new ConstantScorer('c', 0), 1, 1);
    const r = e.update(pt(0));
    expect(r.isAnomaly).toBe(false); // quorum 1/3 < 0.8
  });

  it('works with real streaming detectors via adapter', () => {
    const e = new EnsembleDetector({ threshold: 0.5 });
    e.addMember(new DetectorAdapter(new MovingAverageDetector({ window: 5, threshold: 2 }), 1), 1);
    e.addMember(new DetectorAdapter(new EwmaDetector({ alpha: 0.5, threshold: 2 }), 1), 1);
    const normal = [10, 11, 10, 9, 10, 11, 10, 10];
    for (const v of normal) e.update({ timestamp: 0, value: v });
    const r = e.update({ timestamp: 0, value: 100 });
    expect(r.isAnomaly).toBe(true);
  });

  it('toAnomaly produces shared shape', () => {
    const e = new EnsembleDetector();
    e.addMember(new ConstantScorer('a', 0.9), 1);
    const r = e.update(pt(5));
    const a = toAnomaly(r);
    expect(a.detector).toBe('ensemble');
    expect(a.explanation).toContain('a');
  });
});

/* ---------------------------------------------------------------------- */
/* Drift adaptation                                                       */
/* ---------------------------------------------------------------------- */

/** Flip-flop drift monitor: fires every Nth observation. */
class PeriodicDrift implements IDriftMonitor {
  private n = 0;
  constructor(private readonly period: number) {}
  observe(): boolean {
    this.n++;
    return this.n % this.period === 0;
  }
  reset(): void {
    this.n = 0;
  }
}

describe('ConceptDriftAdapter', () => {
  const pt = (v: number): DataPoint => ({ timestamp: 0, value: v });

  it('decays a persistently disagreeing member', () => {
    const e = new EnsembleDetector({ threshold: 0.5 });
    // 'rebel' always flags; others never do → ensemble never flags,
    // rebel always disagrees.
    e.addMember(new ConstantScorer('rebel', 1), 1, 1);
    e.addMember(new ConstantScorer('calm1', 0), 1, 1);
    e.addMember(new ConstantScorer('calm2', 0), 1, 1);
    const adapter = new ConceptDriftAdapter(e, undefined, { learningRate: 0.3 });
    for (let i = 0; i < 40; i++) adapter.observe(pt(0));
    const rebelW = adapter.weightOf('rebel')!;
    const calmW = adapter.weightOf('calm1')!;
    expect(rebelW).toBeLessThan(calmW);
    expect(adapter.agreementOf('rebel')!).toBeLessThan(0.2);
  });

  it('rewards members agreeing with the consensus', () => {
    const e = new EnsembleDetector({ threshold: 0.5, minQuorum: 0 });
    e.addMember(new ConstantScorer('a', 1), 1, 1);
    e.addMember(new ConstantScorer('b', 1), 1, 1);
    e.addMember(new ConstantScorer('odd', 0), 1, 1);
    const adapter = new ConceptDriftAdapter(e, undefined, { learningRate: 0.3 });
    for (let i = 0; i < 40; i++) adapter.observe(pt(0));
    expect(adapter.agreementOf('a')!).toBeGreaterThan(0.8);
    expect(adapter.agreementOf('odd')!).toBeLessThan(0.2);
  });

  it('soft-resets weights on detected drift', () => {
    const e = new EnsembleDetector({ threshold: 0.5 });
    e.addMember(new ConstantScorer('rebel', 1), 1, 1);
    e.addMember(new ConstantScorer('calm', 0), 1, 1);
    const drift = new PeriodicDrift(20);
    const adapter = new ConceptDriftAdapter(e, drift, {
      learningRate: 0.5,
      driftResetBlend: 0.9,
    });
    let drifts = 0;
    for (let i = 0; i < 60; i++) {
      const { drifted } = adapter.observe(pt(0));
      if (drifted) drifts++;
    }
    expect(drifts).toBe(3);
    expect(adapter.driftCount).toBe(3);
    // After each drift, rebel's decayed weight is pulled toward uniform.
    const w = adapter.weightOf('rebel')!;
    expect(w).toBeGreaterThan(0.05); // floor respected, partially restored
  });
});

/* ---------------------------------------------------------------------- */
/* Explainer                                                              */
/* ---------------------------------------------------------------------- */

describe('ZScoreExplainer', () => {
  it('attributes the anomaly to the shifted feature', () => {
    const ex = new ZScoreExplainer();
    // Normal traffic: cpu ~50, mem ~60, disk ~30
    const g = gaussian(21);
    for (let i = 0; i < 100; i++) {
      ex.observe({ cpu: 50 + g.next().value, mem: 60 + g.next().value, disk: 30 + g.next().value });
    }
    const explanation = ex.explain({ cpu: 50.5, mem: 60.5, disk: 500 });
    expect(explanation.topFeature).toBe('disk');
    expect(explanation.contributions[0].share).toBeGreaterThan(0.9);
  });
});

describe('LeaveOneOutExplainer', () => {
  it('identifies the driving feature by score drop', () => {
    // Scorer: anomaly = max over features of (v - baseline).
    const scorer = (p: Readonly<Record<string, number>>) =>
      Math.max(...Object.values(p));
    const ex = new LeaveOneOutExplainer(scorer, () => 0);
    const r = ex.explain({ a: 1, b: 2, c: 50 });
    expect(r.topFeature).toBe('c');
    expect(r.contributions[0].share).toBeGreaterThan(0.8);
  });
});

/* ---------------------------------------------------------------------- */
/* Threshold tuning                                                       */
/* ---------------------------------------------------------------------- */

describe('P2Quantile', () => {
  it('tracks the median of uniform data', () => {
    const q = new P2Quantile(0.5);
    for (let i = 1; i <= 1000; i++) q.add(i);
    expect(q.value).toBeCloseTo(500, -1.5); // within ~15 of 500.5
  });

  it('tracks the 99th percentile of gaussian data', () => {
    const q = new P2Quantile(0.99);
    const g = gaussian(99, 0, 1);
    const data: number[] = [];
    for (let i = 0; i < 5000; i++) {
      const v = g.next().value;
      data.push(v);
      q.add(v);
    }
    data.sort((a, b) => a - b);
    const trueP99 = data[Math.floor(0.99 * data.length)];
    expect(q.value).toBeCloseTo(trueP99, 0);
  });
});

describe('ThresholdTuner', () => {
  it('emits a threshold near the (1-FPR) quantile', () => {
    const t = new ThresholdTuner({ targetFpr: 0.05, minThreshold: 0.1, maxThreshold: 100 });
    const g = gaussian(5, 0, 1);
    for (let i = 0; i < 2000; i++) t.observe(Math.abs(g.next().value));
    const thr = t.threshold();
    // |N(0,1)| 95th pct ≈ 1.96·? — actually |Z| 95pct ≈ 1.96? No: P(|Z|>1.96)=0.05? P(Z>1.96)=0.025, two-sided 5%? |Z|>1.96 = 5%? P(|Z|>1.96)=0.05 yes.
    expect(thr).toBeGreaterThan(1.5);
    expect(thr).toBeLessThan(2.5);
  });

  it('isAnomaly uses the tuned threshold', () => {
    const t = new ThresholdTuner({ targetFpr: 0.01 });
    for (let i = 0; i < 500; i++) t.observe(i / 500); // scores 0..1
    expect(t.isAnomaly(0.5)).toBe(false);
    expect(t.isAnomaly(0.999)).toBe(true);
  });

  it('respects min/max bounds', () => {
    const t = new ThresholdTuner({ targetFpr: 0.5, minThreshold: 10, maxThreshold: 20 });
    for (let i = 0; i < 100; i++) t.observe(i); // p50 ≈ 50 → clamped to 20
    expect(t.threshold()).toBe(20);
  });

  it('not ready before warmup', () => {
    const t = new ThresholdTuner({ targetFpr: 0.05 });
    t.observe(1);
    expect(t.ready).toBe(false);
    expect(Number.isNaN(t.threshold())).toBe(true);
  });
});
