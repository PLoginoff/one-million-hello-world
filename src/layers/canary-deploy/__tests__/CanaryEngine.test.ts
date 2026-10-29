/**
 * Canary Deploy engine — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MetricGate, RolloutState } from '../canary/CanaryTypes';
import { StepPlanner } from '../canary/StepPlanner';
import { CanaryAnalyzer, SampleStats, welchTTest, tCritical, erfc } from '../canary/CanaryAnalyzer';
import { TrafficMirror } from '../canary/TrafficMirror';
import { CanaryController, InvalidRolloutTransition } from '../canary/CanaryController';

function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

// ----------------------------------------------------------------- StepPlanner

describe('StepPlanner', () => {
  it('standard plan is 5→10→25→50→100', () => {
    const p = StepPlanner.standard(60_000);
    expect(p.steps.map((s) => s.weightPercent)).toEqual([5, 10, 25, 50, 100]);
    expect(p.stepCount).toBe(5);
  });

  it('rejects non-monotonic, out-of-range, or partial plans', () => {
    expect(() => new StepPlanner([{ weightPercent: 50, analysisMs: 1 }, { weightPercent: 40, analysisMs: 1 }])).toThrow(RangeError);
    expect(() => new StepPlanner([{ weightPercent: 0, analysisMs: 1 }, { weightPercent: 100, analysisMs: 1 }])).toThrow(RangeError);
    expect(() => new StepPlanner([{ weightPercent: 50, analysisMs: 1 }])).toThrow(RangeError); // doesn't reach 100
    expect(() => new StepPlanner([{ weightPercent: 100, analysisMs: 0 }])).toThrow(RangeError);
  });

  it('linear plan builds evenly-spaced steps', () => {
    const p = StepPlanner.linear(4);
    expect(p.steps.map((s) => s.weightPercent)).toEqual([25, 50, 75, 100]);
  });

  it('back-off halves weights down to 0', () => {
    const p = StepPlanner.standard();
    const back = p.planBackOff(3); // from 50%
    expect(back.map((s) => s.weightPercent)).toEqual([25, 12, 6, 3, 1]);
  });

  it('total analysis time sums all steps', () => {
    expect(StepPlanner.standard(100).totalAnalysisMs()).toBe(500);
  });
});

// -------------------------------------------------------------- CanaryAnalyzer

describe('CanaryAnalyzer', () => {
  const gate = (over: Partial<MetricGate> = {}): MetricGate => ({
    name: 'err',
    metric: 'error-rate',
    mode: 'absolute',
    threshold: 0.05,
    minSamples: 2,
    ...over,
  });

  it('absolute gate: canary under threshold passes', () => {
    const clk = fakeClock();
    const a = new CanaryAnalyzer(clk.now);
    a.record('error-rate', 'baseline', 0.01);
    a.record('error-rate', 'baseline', 0.02);
    a.record('error-rate', 'canary', 0.02);
    a.record('error-rate', 'canary', 0.03);
    const v = a.evaluateGate(gate(), 60_000);
    expect(v.passed).toBe(true);
    expect(v.canaryValue).toBeCloseTo(0.025);
  });

  it('absolute gate: canary over threshold fails', () => {
    const a = new CanaryAnalyzer();
    a.record('error-rate', 'baseline', 0.01);
    a.record('error-rate', 'baseline', 0.01);
    a.record('error-rate', 'canary', 0.2);
    a.record('error-rate', 'canary', 0.3);
    expect(a.evaluateGate(gate(), 60_000).passed).toBe(false);
  });

  it('relative gate compares against baseline×(1+tol)', () => {
    const a = new CanaryAnalyzer();
    [0.1, 0.1].forEach((v) => a.record('error-rate', 'baseline', v));
    a.record('error-rate', 'canary', 0.105);
    a.record('error-rate', 'canary', 0.105);
    // baseline 0.1, tol 0.1 → limit 0.11; canary 0.105 passes
    expect(
      a.evaluateGate(gate({ mode: 'relative', toleranceRatio: 0.1 }), 60_000).passed
    ).toBe(true);
    const a2 = new CanaryAnalyzer();
    [0.1, 0.1].forEach((v) => a2.record('error-rate', 'baseline', v));
    a2.record('error-rate', 'canary', 0.2);
    a2.record('error-rate', 'canary', 0.2);
    expect(
      a2.evaluateGate(gate({ mode: 'relative', toleranceRatio: 0.1 }), 60_000).passed
    ).toBe(false);
  });

  it('statistical gate passes equal distributions, fails shifted', () => {
    const a = new CanaryAnalyzer();
    const lat = gate({ metric: 'latency-p99', mode: 'statistical', minSamples: 5 });
    // Same distribution.
    for (const v of [100, 110, 95, 105, 100]) a.record('latency-p99', 'baseline', v);
    for (const v of [101, 109, 96, 104, 102]) a.record('latency-p99', 'canary', v);
    const v = a.evaluateGate(lat, 60_000);
    expect(v.passed).toBe(true);

    const a2 = new CanaryAnalyzer();
    for (const v of [100, 110, 95, 105, 100]) a2.record('latency-p99', 'baseline', v);
    for (const v of [500, 510, 495, 505, 500]) a2.record('latency-p99', 'canary', v);
    const v2 = a2.evaluateGate(lat, 60_000);
    expect(v2.passed).toBe(false);
    expect(v2.reason).toContain('worse');
  });

  it('gate fails closed on insufficient samples', () => {
    const a = new CanaryAnalyzer();
    a.record('error-rate', 'canary', 0.001); // only 1 canary, 0 baseline
    const v = a.evaluateGate(gate({ minSamples: 3 }), 60_000);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain('insufficient');
  });

  it('window scoping ignores stale samples', () => {
    const clk = fakeClock();
    const a = new CanaryAnalyzer(clk.now);
    a.record('error-rate', 'canary', 0.9); // stale bad canary sample
    clk.advance(120_000);
    // Fresh baseline + canary inside the window.
    a.record('error-rate', 'baseline', 0.01);
    a.record('error-rate', 'baseline', 0.01);
    a.record('error-rate', 'canary', 0.01);
    a.record('error-rate', 'canary', 0.02);
    // Window 60s excludes the stale 0.9 sample from the canary cohort.
    const v = a.evaluateGate(gate({ minSamples: 2 }), 60_000);
    expect(v.canaryValue).toBeCloseTo(0.015);
    expect(v.passed).toBe(true);
  });

  it('Welch t-test math is correct on a known pair', () => {
    const a = new SampleStats();
    [2, 4, 4, 4, 5, 5, 7, 9].forEach((v) => a.add(v));
    const b = new SampleStats();
    [2, 4, 4, 4, 5, 5, 7, 9].forEach((v) => b.add(v));
    const r = welchTTest(a, b);
    expect(r).not.toBeNull();
    expect(r!.t).toBe(0); // identical distributions
    expect(tCritical(0.05, 30)).toBeCloseTo(2.042, 2);
    // A&S 7.1.26 is an approximation (|ε| ≤ 1.5e-7), not exact at 0.
    expect(erfc(0)).toBeCloseTo(1, 6);
  });
});

// --------------------------------------------------------------- TrafficMirror

describe('TrafficMirror', () => {
  it('mirrors a fraction of requests deterministically', async () => {
    const mirror = new TrafficMirror(
      async () => ({ latencyMs: 5, response: { ok: true } }),
      { random: () => 0.5, mirrorFraction: 0.6 }
    );
    const r1 = await mirror.mirror('r1', {}, { ok: true });
    expect(r1).not.toBeNull();
    const m2 = new TrafficMirror(async () => ({ latencyMs: 1, response: {} }), {
      random: () => 0.9,
      mirrorFraction: 0.6,
    });
    expect(await m2.mirror('r2', {}, {})).toBeNull();
  });

  it('detects response divergence via differ', async () => {
    const mirror = new TrafficMirror(
      async () => ({ latencyMs: 5, response: { status: 200, body: 'new' } }),
      { random: () => 0, mirrorFraction: 1 }
    );
    const r = await mirror.mirror('r1', {}, { status: 200, body: 'old' });
    expect(r?.canaryOk).toBe(true);
    expect(r?.diffKeys).toEqual(['body']);
    expect(mirror.divergenceRate).toBe(1);
  });

  it('canary errors are captured, never thrown', async () => {
    const mirror = new TrafficMirror(
      async () => {
        throw new Error('canary exploded');
      },
      { random: () => 0, mirrorFraction: 1 }
    );
    const r = await mirror.mirror('r1', {}, {});
    expect(r?.canaryOk).toBe(false);
    expect(r?.error).toBe('canary exploded');
    expect(mirror.divergenceRate).toBe(1);
  });

  it('canary error responses (non-throw) are captured', async () => {
    const mirror = new TrafficMirror(async () => ({ latencyMs: 2, error: 'timeout' }), {
      random: () => 0,
      mirrorFraction: 1,
    });
    const r = await mirror.mirror('r1', {}, {});
    expect(r?.canaryOk).toBe(false);
    expect(r?.error).toBe('timeout');
  });
});

// ------------------------------------------------------------ CanaryController

describe('CanaryController', () => {
  let clk: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    clk = fakeClock();
  });

  const absGate = (over: Partial<MetricGate> = {}): MetricGate => ({
    name: 'err',
    metric: 'error-rate',
    mode: 'absolute',
    threshold: 0.1,
    minSamples: 1,
    ...over,
  });

  function makeController(
    gates: MetricGate[] = [absGate()],
    opts: { steps?: number[]; baselineMs?: number } = {}
  ) {
    const planner = new StepPlanner(
      (opts.steps ?? [50, 100]).map((w) => ({ weightPercent: w, analysisMs: 100 }))
    );
    return new CanaryController(
      {
        rolloutId: 'r1',
        version: 'v2',
        planner,
        gates,
        baselineWindowMs: opts.baselineMs ?? 50,
      },
      clk.now,
      async (ms) => clk.advance(ms)
    );
  }

  it('enforces transition guards', () => {
    const c = makeController();
    expect(() => c.transition(RolloutState.PROMOTED)).toThrow(InvalidRolloutTransition);
    c.transition(RolloutState.BASELINING, 'ok');
    expect(c.state).toBe(RolloutState.BASELINING);
  });

  it('promotes when all gates pass across all steps', async () => {
    const c = makeController();
    const final = await c.run(async () => {
      c.recordMetric('error-rate', 'baseline', 0.01);
      c.recordMetric('error-rate', 'canary', 0.01);
    });
    expect(final).toBe(RolloutState.PROMOTED);
    expect(c.weight).toBe(100);
    expect(c.results.length).toBe(2);
    expect(c.transitions.some((t) => t.to === RolloutState.PROMOTED)).toBe(true);
  });

  it('rolls back when gates keep failing', async () => {
    const c = makeController([absGate({ allowedFailures: 0 })]);
    const final = await c.run(async () => {
      c.recordMetric('error-rate', 'baseline', 0.01);
      c.recordMetric('error-rate', 'canary', 0.5); // way over 0.1
    });
    expect(final).toBe(RolloutState.ROLLED_BACK);
    expect(c.weight).toBe(0);
    expect(c.transitions.some((t) => t.to === RolloutState.ROLLING_BACK)).toBe(true);
  });

  it('allowedFailures grants one retry then rolls back', async () => {
    const c = makeController([absGate({ allowedFailures: 1 })], { steps: [100] });
    const final = await c.run(async () => {
      c.recordMetric('error-rate', 'baseline', 0.01);
      c.recordMetric('error-rate', 'canary', 0.5);
    });
    expect(final).toBe(RolloutState.ROLLED_BACK);
    expect(c.results.length).toBe(2); // initial + 1 retry
  });

  it('manual pause/resume holds the rollout', async () => {
    const c = makeController();
    await c.start();
    expect(c.state).toBe(RolloutState.STEPPING);
    c.pause('hold');
    expect(c.state).toBe(RolloutState.PAUSED);
    c.resume();
    expect(c.state).toBe(RolloutState.STEPPING);
    expect(() => c.resume()).toThrow();
  });

  it('operator rollback from STEPPING', async () => {
    const c = makeController();
    await c.start();
    c.rollback('nope');
    expect(c.state).toBe(RolloutState.ROLLED_BACK);
    expect(c.weight).toBe(0);
  });

  it('statistical gate rolls back a latent regression', async () => {
    const c = makeController(
      [
        {
          name: 'lat',
          metric: 'latency-p99',
          mode: 'statistical',
          minSamples: 3,
        },
      ],
      { steps: [100] }
    );
    const final = await c.run(async () => {
      for (const v of [100, 105, 95, 100, 110]) c.recordMetric('latency-p99', 'baseline', v);
      for (const v of [900, 950, 920, 910, 940]) c.recordMetric('latency-p99', 'canary', v);
    });
    expect(final).toBe(RolloutState.ROLLED_BACK);
  });

  it('tick() is a no-op until soak elapses', async () => {
    const c = makeController();
    await c.start();
    clk.advance(50); // < 100ms analysis
    expect(await c.tick()).toBeNull();
    expect(c.state).toBe(RolloutState.STEPPING);
    c.recordMetric('error-rate', 'baseline', 0.01);
    c.recordMetric('error-rate', 'canary', 0.01);
    clk.advance(60); // past analysisMs
    const r = await c.tick();
    expect(r).not.toBeNull();
    expect(r?.passed).toBe(true);
    expect(c.stepIndex).toBe(1);
  });
});
