/**
 * Chaos Engineering Engine2 — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import {
  FaultKind,
  FaultSeverity,
  ToleranceKind,
  ChaosExperimentDefinition,
} from '../engine/ChaosEngineTypes';
import {
  AnalysisInputError,
  AnalyzedSeries,
  DeviationDirection,
  ExperimentResultAnalyzer,
  formatAnalysisReport,
  PhaseSample,
  tTwoTailedP,
  VerdictPolicy,
} from '../engine2/ExperimentResultAnalyzer';
import {
  ChaosSafetyValidator,
  FindingSeverity,
  MalformedExperimentError,
} from '../engine2/ChaosSafetyValidator';
import {
  DependencyChaosMap,
  DependencyMapError,
  ServiceTier,
} from '../engine2/DependencyChaosMap';

/* ----------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ----------------------------------------------------------------------- */

function samples(values: number[], startAt = 0, stepMs = 1000): PhaseSample[] {
  return values.map((v, i) => ({ value: v, at: startAt + i * stepMs }));
}

/** Draws n deterministic pseudo-random samples around mean.
 *
 * The index enters the hash so same-seeded windows don't produce
 * correlated draws (a correlated +Δ shift is trivially detectable and
 * would make "steady" tests flaky).
 */
function noisy(n: number, mean: number, spread: number, seed = 42): PhaseSample[] {
  const out: PhaseSample[] = [];
  for (let i = 0; i < n; i++) {
    let h = (seed * 2654435761 + i * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) * 3266489917;
    h = (h ^ (h >>> 16)) >>> 0;
    const u1 = h / 4294967296;
    let h2 = (h * 2654435761 + 12345) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) * 3266489917;
    h2 = (h2 ^ (h2 >>> 16)) >>> 0;
    const u2 = h2 / 4294967296;
    // Sum of two uniforms centred at 0 — crude but deterministic noise.
    const v = mean + (u1 + u2 - 1) * spread;
    out.push({ value: v, at: i * 1000 });
  }
  return out;
}

function makeDef(overrides: Partial<ChaosExperimentDefinition> = {}): ChaosExperimentDefinition {
  return {
    id: 'exp-1',
    name: 'test',
    description: 'test experiment',
    faults: [
      {
        id: 'f1',
        kind: FaultKind.LATENCY,
        severity: FaultSeverity.LOW,
        probability: 0.5,
        latencyMs: 50,
      },
    ],
    scope: { percentage: 0.25 },
    hypothesis: [
      {
        name: 'p99',
        description: 'p99 latency stays < 500ms',
        sample: () => 300,
        tolerance: { kind: ToleranceKind.AT_MOST, threshold: 500 },
        minSamples: 3,
      },
    ],
    abortConditions: [
      {
        name: 'error-spike',
        description: 'abort if error rate spikes',
        metric: 'error-rate',
        threshold: 0.05,
        comparator: '>',
        windowMs: 60000,
      },
    ],
    durationMs: 600000,
    ...overrides,
  };
}

/* ----------------------------------------------------------------------- */
/* ExperimentResultAnalyzer                                                */
/* ----------------------------------------------------------------------- */

describe('ExperimentResultAnalyzer', () => {
  it('detects steady metric when windows are drawn from the same distribution', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const series: AnalyzedSeries = {
      metric: 'latency',
      baseline: noisy(30, 100, 10),
      during: noisy(30, 100.5, 10, 7),
    };
    const c = analyzer.compareSeries(series);
    expect(c.steady).toBe(true);
    expect(c.pValue).toBeGreaterThan(0.05);
  });

  it('detects significant increase for latency-style metrics', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const series: AnalyzedSeries = {
      metric: 'latency',
      baseline: noisy(30, 100, 5),
      during: noisy(30, 160, 5, 7),
    };
    const c = analyzer.compareSeries(series);
    expect(c.steady).toBe(false);
    expect(c.confidence).toBeGreaterThan(0.95);
    expect(c.meanShift).toBeGreaterThan(40);
    expect(c.effectSize).toBeGreaterThan(1); // huge effect
  });

  it('honours decrease-is-bad direction for throughput', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const series: AnalyzedSeries = {
      metric: 'throughput',
      baseline: noisy(30, 1000, 20),
      during: noisy(30, 700, 20),
      direction: DeviationDirection.DECREASE_IS_BAD,
    };
    const c = analyzer.compareSeries(series);
    expect(c.steady).toBe(false);
    expect(c.meanShift).toBeLessThan(0);
  });

  it('treats a favourable shift as steady under directional testing', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    // Latency *decreased* during fault — significant, but in the good direction.
    const series: AnalyzedSeries = {
      metric: 'latency',
      baseline: noisy(30, 200, 5),
      during: noisy(30, 100, 5),
      direction: DeviationDirection.INCREASE_IS_BAD,
    };
    const c = analyzer.compareSeries(series);
    expect(c.steady).toBe(true);
  });

  it('flags any-drift for symmetric comparisons', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const series: AnalyzedSeries = {
      metric: 'queue-depth',
      baseline: noisy(30, 50, 3),
      during: noisy(30, 10, 3),
      direction: DeviationDirection.ANY_DRIFT,
    };
    const c = analyzer.compareSeries(series);
    expect(c.steady).toBe(false);
  });

  it('throws when windows have insufficient samples', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    expect(() =>
      analyzer.compareSeries({
        metric: 'x',
        baseline: samples([1, 2, 3]),
        during: samples([1, 2, 3, 4, 5, 6]),
      })
    ).toThrow(AnalysisInputError);
  });

  it('reports insufficient-data series as non-steady in analyze()', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const a = analyzer.analyze([
      { metric: 'ok', baseline: noisy(10, 5, 1), during: noisy(10, 5, 1, 7) },
      { metric: 'sparse', baseline: samples([1]), during: samples([2]) },
    ]);
    expect(a.comparisons.length).toBe(2);
    expect(a.hypothesisHeld).toBe(false); // sparse series can't pass
  });

  it('degenerate zero-variance identical windows are steady', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 3 });
    const c = analyzer.compareSeries({
      metric: 'flat',
      baseline: samples([10, 10, 10, 10]),
      during: samples([10, 10, 10]),
    });
    expect(c.steady).toBe(true);
    expect(c.pValue).toBe(1);
  });

  it('zero-variance divergent windows are flagged', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 3 });
    const c = analyzer.compareSeries({
      metric: 'step',
      baseline: samples([10, 10, 10, 10]),
      during: samples([20, 20, 20]),
    });
    expect(c.steady).toBe(false);
    expect(c.pValue).toBe(0);
  });

  it('combines metrics under ALL policy (default)', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const a = analyzer.analyze([
      { metric: 'good', baseline: noisy(20, 100, 5), during: noisy(20, 100, 5, 7) },
      { metric: 'bad', baseline: noisy(20, 100, 5, 11), during: noisy(20, 500, 5, 13) },
    ]);
    expect(a.hypothesisHeld).toBe(false);
    expect(a.worstMetric?.metric).toBe('bad');
  });

  it('combines metrics under ANY policy', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5, policy: VerdictPolicy.ANY });
    const a = analyzer.analyze([
      { metric: 'good', baseline: noisy(20, 100, 5), during: noisy(20, 100, 5, 7) },
      { metric: 'bad', baseline: noisy(20, 100, 5, 11), during: noisy(20, 500, 5, 13) },
    ]);
    expect(a.hypothesisHeld).toBe(true);
  });

  it('quorum policy needs ≥ fraction to hold', () => {
    const analyzer = new ExperimentResultAnalyzer({
      minSamples: 5,
      policy: VerdictPolicy.QUORUM,
      quorumFraction: 0.5,
    });
    const a = analyzer.analyze([
      { metric: 'a', baseline: noisy(20, 100, 5), during: noisy(20, 100, 5, 7) },
      { metric: 'b', baseline: noisy(20, 100, 5, 11), during: noisy(20, 900, 5, 13) },
    ]);
    expect(a.hypothesisHeld).toBe(true); // 1/2 = quorum
  });

  it('recovery assessment detects return-to-baseline', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const rec = analyzer.assessRecovery({
      metric: 'latency',
      baseline: noisy(20, 100, 5),
      during: noisy(20, 400, 5, 7),
      recovery: noisy(20, 100.5, 5, 11),
    });
    expect(rec).not.toBeNull();
    expect(rec?.recovered).toBe(true);
  });

  it('recovery assessment detects lingering degradation', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const rec = analyzer.assessRecovery({
      metric: 'latency',
      baseline: noisy(20, 100, 5),
      during: noisy(20, 400, 5, 7),
      recovery: noisy(20, 350, 5, 11),
    });
    expect(rec?.recovered).toBe(false);
  });

  it('returns null recovery when no recovery samples', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const rec = analyzer.assessRecovery({
      metric: 'm',
      baseline: noisy(10, 1, 0.1),
      during: noisy(10, 1, 0.1),
    });
    expect(rec).toBeNull();
  });

  it('formatAnalysisReport produces readable text', () => {
    const analyzer = new ExperimentResultAnalyzer({ minSamples: 5 });
    const a = analyzer.analyze([
      {
        metric: 'lat',
        baseline: noisy(15, 100, 5),
        during: noisy(15, 300, 5, 7),
        recovery: noisy(15, 100.5, 5, 11),
      },
    ]);
    const text = formatAnalysisReport(a);
    expect(text).toContain('Hypothesis held: NO');
    expect(text).toContain('lat');
    expect(text).toContain('RECOVERED');
  });

  it('tTwoTailedP matches known values', () => {
    // t=0 → p=1; large t → p→0; known table value t(2.0, df=10) ≈ 0.0734
    expect(tTwoTailedP(0, 10)).toBeCloseTo(1, 6);
    expect(tTwoTailedP(2.0, 10)).toBeCloseTo(0.0734, 3);
    expect(tTwoTailedP(3.169, 10)).toBeCloseTo(0.01, 2);
    expect(tTwoTailedP(100, 30)).toBeLessThan(0.001);
  });
});

/* ----------------------------------------------------------------------- */
/* ChaosSafetyValidator                                                    */
/* ----------------------------------------------------------------------- */

describe('ChaosSafetyValidator', () => {
  it('passes a well-formed experiment', () => {
    const v = new ChaosSafetyValidator();
    const verdict = v.validate(makeDef());
    expect(verdict.allowed).toBe(true);
    expect(verdict.errorCount).toBe(0);
  });

  it('blocks blast radius above global cap', () => {
    const v = new ChaosSafetyValidator();
    const verdict = v.validate(makeDef({ scope: { percentage: 0.9 } }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings.some((f) => f.check === 'blast-radius.cap')).toBe(true);
  });

  it('enforces per-severity blast caps', () => {
    const v = new ChaosSafetyValidator();
    const def = makeDef({
      faults: [
        {
          id: 'f-crit',
          kind: FaultKind.LATENCY,
          severity: FaultSeverity.CRITICAL,
          probability: 1,
          latencyMs: 10,
        },
      ],
      scope: { percentage: 0.3 }, // > 0.1 critical cap
    });
    const verdict = v.validate(def);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings.some((f) => f.check === 'blast-radius.severity-cap')).toBe(true);
  });

  it('requires abort conditions by default', () => {
    const v = new ChaosSafetyValidator();
    const verdict = v.validate(makeDef({ abortConditions: [] }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings.some((f) => f.check === 'abort.required')).toBe(true);
  });

  it('requires a hypothesis by default', () => {
    const v = new ChaosSafetyValidator();
    const verdict = v.validate(makeDef({ hypothesis: [] }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings.some((f) => f.check === 'hypothesis.required')).toBe(true);
  });

  it('validates tolerance internal consistency', () => {
    const v = new ChaosSafetyValidator();
    const def = makeDef({
      hypothesis: [
        {
          name: 'p',
          description: 'd',
          sample: () => 1,
          tolerance: { kind: ToleranceKind.IN_RANGE, min: 10, max: 5 },
          minSamples: 1,
        },
      ],
    });
    const verdict = v.validate(def);
    expect(verdict.findings.some((f) => f.check === 'tolerance.range')).toBe(true);
  });

  it('rejects out-of-range fault probability', () => {
    const v = new ChaosSafetyValidator();
    const def = makeDef({
      faults: [
        { id: 'f', kind: FaultKind.ERROR, severity: FaultSeverity.LOW, probability: 1.5, errorCode: 'X' },
      ],
    });
    const verdict = v.validate(def);
    expect(verdict.findings.some((f) => f.check === 'fault.probability')).toBe(true);
  });

  it('rejects inverted latency jitter', () => {
    const v = new ChaosSafetyValidator();
    const def = makeDef({
      faults: [
        {
          id: 'f',
          kind: FaultKind.LATENCY,
          severity: FaultSeverity.LOW,
          probability: 0.5,
          latencyMs: [200, 50],
        },
      ],
    });
    const verdict = v.validate(def);
    expect(verdict.findings.some((f) => f.check === 'fault.latency.order')).toBe(true);
  });

  it('caps explicit targets', () => {
    const v = new ChaosSafetyValidator({ maxExplicitTargets: 2 });
    const def = makeDef({
      scope: { percentage: 0.25, targetIds: new Set(['a', 'b', 'c']) },
    });
    const verdict = v.validate(def);
    expect(verdict.findings.some((f) => f.check === 'blast-radius.targets-cap')).toBe(true);
  });

  it('warns on unknown abort metric when knownMetrics configured', () => {
    const v = new ChaosSafetyValidator({ knownMetrics: new Set(['error-rate']) });
    const def = makeDef({
      abortConditions: [
        {
          name: 'x',
          description: 'd',
          metric: 'some-mystery-metric',
          threshold: 1,
          comparator: '>',
          windowMs: 1000,
        },
      ],
    });
    const verdict = v.validate(def);
    expect(verdict.findings.some((f) => f.check === 'abort.metric' && f.severity === FindingSeverity.WARNING)).toBe(true);
    expect(verdict.allowed).toBe(true); // warning, not error
  });

  it('blocks start inside blackout window', () => {
    const v = new ChaosSafetyValidator({
      safetyWindows: [
        { name: 'deploy-freeze', startsAt: 1000, endsAt: 2000, blackout: true },
      ],
    });
    const verdict = v.validate(makeDef(), 1500);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings.some((f) => f.check === 'window.blackout')).toBe(true);
  });

  it('warns outside allow-windows', () => {
    const v = new ChaosSafetyValidator({
      safetyWindows: [{ name: 'biz-hours', startsAt: 0, endsAt: 100, blackout: false }],
    });
    const verdict = v.validate(makeDef(), 5000);
    expect(verdict.findings.some((f) => f.check === 'window.whitelist')).toBe(true);
  });

  it('rejects duration above cap', () => {
    const v = new ChaosSafetyValidator({ maxDurationMs: 1000 });
    const verdict = v.validate(makeDef({ durationMs: 5000 }));
    expect(verdict.findings.some((f) => f.check === 'timing.duration-max')).toBe(true);
  });

  it('assertAllowed throws with all error details', () => {
    const v = new ChaosSafetyValidator();
    try {
      v.assertAllowed(makeDef({ abortConditions: [], scope: { percentage: 0.9 } }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MalformedExperimentError);
      const msg = (e as Error).message;
      expect(msg).toContain('abort.required');
      expect(msg).toContain('blast-radius.cap');
    }
  });

  it('throws on malformed definitions (no faults)', () => {
    const v = new ChaosSafetyValidator();
    expect(() => v.validate(makeDef({ faults: [] }))).toThrow(MalformedExperimentError);
  });
});

/* ----------------------------------------------------------------------- */
/* DependencyChaosMap                                                      */
/* ----------------------------------------------------------------------- */

describe('DependencyChaosMap', () => {
  function buildMap(): DependencyChaosMap {
    const m = new DependencyChaosMap();
    m.addService({ id: 'frontend', tier: ServiceTier.TIER_0, replicas: 4 });
    m.addService({ id: 'checkout', tier: ServiceTier.TIER_0, replicas: 2 });
    m.addService({ id: 'payments', tier: ServiceTier.TIER_0, replicas: 1 });
    m.addService({ id: 'recommendations', tier: ServiceTier.TIER_1, replicas: 3 });
    m.addService({ id: 'analytics', tier: ServiceTier.TIER_3, replicas: 1 });
    // frontend → checkout → payments; frontend → recommendations
    m.addDependency({ from: 'frontend', to: 'checkout', weight: 0.8, hard: true });
    m.addDependency({ from: 'frontend', to: 'recommendations', weight: 0.5, hard: false });
    m.addDependency({ from: 'checkout', to: 'payments', weight: 1.0, hard: true });
    m.addDependency({ from: 'analytics', to: 'frontend', weight: 0.1, hard: false });
    return m;
  }

  it('computes direct impact on targeted service', () => {
    const m = buildMap();
    const cone = m.computeBlastCone({
      experimentId: 'exp-1',
      targets: { payments: 1.0 },
    });
    const pay = cone.impacted.find((i) => i.serviceId === 'payments');
    expect(pay).toBeDefined();
    expect(pay?.direct).toBe(true);
    expect(pay?.impact).toBe(1.0);
  });

  it('propagates impact upstream to dependents', () => {
    const m = buildMap();
    const cone = m.computeBlastCone({
      experimentId: 'exp-1',
      targets: { payments: 1.0 },
    });
    const ids = cone.impacted.map((i) => i.serviceId);
    expect(ids).toContain('checkout'); // depends on payments
    expect(ids).toContain('frontend'); // depends on checkout
    expect(ids).not.toContain('recommendations'); // parallel branch
    // attenuation: checkout gets 1.0 * weight(1.0) / (1+ln(2))
    const checkout = cone.impacted.find((i) => i.serviceId === 'checkout');
    expect(checkout!.impact).toBeCloseTo(1.0 / (1 + Math.log(2)), 5);
    expect(checkout!.path).toEqual(['payments', 'checkout']);
  });

  it('attenuates soft edges more than hard edges', () => {
    const m = buildMap();
    const cone = m.computeBlastCone({ experimentId: 'e', targets: { frontend: 1.0 } });
    const analytics = cone.impacted.find((i) => i.serviceId === 'analytics');
    // analytics depends (soft, 0.1) on frontend — tiny impact, may prune.
    if (analytics !== undefined) {
      expect(analytics.impact).toBeLessThan(0.1);
    }
  });

  it('records propagation path length as distance', () => {
    const m = buildMap();
    const cone = m.computeBlastCone({ experimentId: 'e', targets: { payments: 1.0 } });
    const frontend = cone.impacted.find((i) => i.serviceId === 'frontend');
    expect(frontend?.distance).toBe(2);
    expect(frontend?.path).toEqual(['payments', 'checkout', 'frontend']);
  });

  it('flags tier-0 transitive impact', () => {
    const m = new DependencyChaosMap();
    m.addService({ id: 'db', tier: ServiceTier.TIER_2, replicas: 1 });
    m.addService({ id: 'api', tier: ServiceTier.TIER_0, replicas: 1 });
    m.addDependency({ from: 'api', to: 'db', weight: 1.0, hard: true });
    const cone = m.computeBlastCone({ experimentId: 'e', targets: { db: 1.0 } });
    expect(cone.touchesTier0).toBe(true);
    expect(cone.highestTierHit).toBe(ServiceTier.TIER_0);
  });

  it('affectedExperiments reverse-indexes experiments by service', () => {
    const m = buildMap();
    const out = m.affectedExperiments('checkout', [
      { experimentId: 'exp-pay', targets: { payments: 1.0 } },
      { experimentId: 'exp-fe', targets: { frontend: 0.5 } },
      { experimentId: 'exp-rec', targets: { recommendations: 1.0 } },
    ]);
    const ids = out.map((o) => o.experimentId);
    expect(ids).toContain('exp-pay'); // checkout is in payments' blast cone
    expect(ids).not.toContain('exp-rec'); // recommendations → nothing hits checkout
  });

  it('conflictingExperiments finds overlapping blast cones', () => {
    const m = buildMap();
    const conflicts = m.conflictingExperiments([
      { experimentId: 'a', targets: { payments: 1.0 } },
      { experimentId: 'b', targets: { checkout: 0.8 } },
      { experimentId: 'c', targets: { recommendations: 1.0 } },
    ]);
    // a and b both hit checkout; c is disjoint.
    const pair = conflicts.find((x) => (x.a === 'a' && x.b === 'b') || (x.a === 'b' && x.b === 'a'));
    expect(pair).toBeDefined();
    expect(pair!.sharedServices).toContain('checkout');
    // c's cone (recommendations) overlaps 'a' only on frontend — a
    // low-weight soft edge that produces a much smaller combined risk.
    const abRisk = pair!.combinedRisk;
    const acPair = conflicts.find((x) => x.a === 'a' && x.b === 'c');
    if (acPair !== undefined) {
      expect(acPair.combinedRisk).toBeLessThan(abRisk);
    }
  });

  it('respects maxDepth and minImpact pruning', () => {
    const m = new DependencyChaosMap({ maxDepth: 1, minImpact: 0.001 });
    m.addService({ id: 'a', tier: ServiceTier.TIER_2, replicas: 1 });
    m.addService({ id: 'b', tier: ServiceTier.TIER_2, replicas: 1 });
    m.addService({ id: 'c', tier: ServiceTier.TIER_2, replicas: 1 });
    m.addDependency({ from: 'b', to: 'a', weight: 1.0, hard: true });
    m.addDependency({ from: 'c', to: 'b', weight: 1.0, hard: true });
    const cone = m.computeBlastCone({ experimentId: 'e', targets: { a: 1.0 } });
    const ids = cone.impacted.map((i) => i.serviceId);
    expect(ids).toContain('b');
    expect(ids).not.toContain('c'); // depth 2 would be needed
  });

  it('rejects unknown target services', () => {
    const m = buildMap();
    expect(() => m.computeBlastCone({ experimentId: 'e', targets: { ghost: 1 } })).toThrow(
      DependencyMapError
    );
  });

  it('rejects invalid seed probability', () => {
    const m = buildMap();
    expect(() =>
      m.computeBlastCone({ experimentId: 'e', targets: { payments: 1.5 } })
    ).toThrow(DependencyMapError);
  });

  it('rejects duplicate services and dangling edges', () => {
    const m = new DependencyChaosMap();
    m.addService({ id: 'a', tier: ServiceTier.TIER_2, replicas: 1 });
    expect(() => m.addService({ id: 'a', tier: ServiceTier.TIER_2, replicas: 1 })).toThrow(
      DependencyMapError
    );
    expect(() =>
      m.addDependency({ from: 'a', to: 'missing', weight: 1, hard: true })
    ).toThrow(DependencyMapError);
  });

  it('serialization round-trips graph shape', () => {
    const m = buildMap();
    const json = m.toJSON();
    expect(json.nodes.length).toBe(5);
    expect(json.edges.length).toBe(4);
  });
});
