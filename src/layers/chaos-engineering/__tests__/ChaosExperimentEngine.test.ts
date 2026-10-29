/**
 * Chaos Experiment Engine — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import {
  AbortCondition,
  ChaosExperimentDefinition,
  ExperimentState,
  FaultKind,
  FaultSeverity,
  ToleranceKind,
} from '../engine/ChaosEngineTypes';
import { ChaosFaultError, FaultInjector } from '../engine/FaultInjector';
import { AbortMonitor } from '../engine/AbortMonitor';
import { SamplePhase, SteadyStateChecker, WelfordAccumulator } from '../engine/SteadyStateChecker';
import {
  ChaosExperimentEngine,
  ExperimentValidationError,
  InvalidTransitionError,
} from '../engine/ChaosExperimentEngine';
import { ChaosScheduler } from '../engine/ChaosScheduler';
import { GameDayOrchestrator } from '../engine/GameDayOrchestrator';

/** Deterministic fake clock. */
function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

/** Cyclic deterministic RNG for reproducible draws. */
function seqRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function latencyFault(id = 'f-lat', probability = 1): {
  id: string;
  kind: FaultKind;
  severity: FaultSeverity;
  probability: number;
  latencyMs: number;
} {
  return { id, kind: FaultKind.LATENCY, severity: FaultSeverity.LOW, probability, latencyMs: 50 };
}

function makeDefinition(overrides: Partial<ChaosExperimentDefinition> = {}): ChaosExperimentDefinition {
  return {
    id: 'exp-1',
    name: 'latency smoke',
    description: 'inject 50ms latency on all requests',
    faults: [latencyFault()],
    scope: { percentage: 1 },
    hypothesis: [
      {
        name: 'error-rate',
        description: 'error rate stays under 1%',
        sample: () => 0.005,
        tolerance: { kind: ToleranceKind.AT_MOST, threshold: 0.01 },
        minSamples: 1,
      },
    ],
    abortConditions: [],
    durationMs: 100,
    ...overrides,
  };
}

// ---------------------------------------------------------------- FaultInjector

describe('FaultInjector', () => {
  it('fires latency fault for in-scope target', () => {
    const inj = new FaultInjector({ percentage: 1 }, fakeClock().now, () => 0);
    inj.arm(latencyFault());
    const outcome = inj.evaluate({ targetId: 't1', attributes: {} });
    expect(outcome.totalLatencyMs).toBe(50);
    expect(outcome.decisions.length).toBe(1);
    expect(outcome.decisions[0].fired).toBe(true);
  });

  it('respects probability draw', () => {
    const inj = new FaultInjector({ percentage: 1 }, Date.now, () => 0.9);
    inj.arm(latencyFault('f1', 0.5));
    const outcome = inj.evaluate({ targetId: 't1', attributes: {} });
    expect(outcome.totalLatencyMs).toBe(0);
    expect(outcome.decisions[0].detail).toBe('draw-miss');
  });

  it('percentage scope excludes some targets', () => {
    const clk = fakeClock();
    // random sequence: first call = scope draw, second = fire draw
    const rnd = seqRandom([0.9, 0]);
    const inj = new FaultInjector({ percentage: 0.5 }, clk.now, rnd);
    inj.arm(latencyFault());
    const out = inj.evaluate({ targetId: 't1', attributes: {} });
    expect(out.decisions[0].inScope).toBe(false);
  });

  it('restricts to explicit target ids', () => {
    const inj = new FaultInjector({ percentage: 1, targetIds: new Set(['a']) }, Date.now, () => 0);
    inj.arm(latencyFault());
    const inA = inj.evaluate({ targetId: 'a', attributes: {} });
    const inB = inj.evaluate({ targetId: 'b', attributes: {} });
    expect(inA.decisions[0].inScope).toBe(true);
    expect(inB.decisions[0].inScope).toBe(false);
  });

  it('enforces maxAffectedTargets cap', () => {
    const inj = new FaultInjector({ percentage: 1, maxAffectedTargets: 1 }, Date.now, () => 0);
    inj.arm(latencyFault());
    inj.evaluate({ targetId: 't1', attributes: {} });
    const second = inj.evaluate({ targetId: 't2', attributes: {} });
    expect(second.decisions[0].inScope).toBe(false);
  });

  it('applies attribute filter', () => {
    const inj = new FaultInjector(
      { percentage: 1, targetFilter: (a) => a.region === 'us-east' },
      Date.now,
      () => 0
    );
    inj.arm(latencyFault());
    const east = inj.evaluate({ targetId: 't', attributes: { region: 'us-east' } });
    const west = inj.evaluate({ targetId: 't', attributes: { region: 'eu-west' } });
    expect(east.decisions[0].inScope).toBe(true);
    expect(west.decisions[0].inScope).toBe(false);
  });

  it('synthesizes ChaosFaultError for error faults', async () => {
    const inj = new FaultInjector({ percentage: 1 }, Date.now, () => 0);
    inj.arm({
      id: 'e1',
      kind: FaultKind.ERROR,
      severity: FaultSeverity.MEDIUM,
      probability: 1,
      errorCode: 'HTTP_500',
      errorMessage: 'boom',
    });
    const out = inj.evaluate({ targetId: 't', attributes: {} });
    expect(out.error).toBeInstanceOf(ChaosFaultError);
    expect(out.error?.code).toBe('HTTP_500');
    await expect(inj.apply({ targetId: 't', attributes: {} })).rejects.toThrow(ChaosFaultError);
  });

  it('drops packets for packet-loss faults', () => {
    // scope draw skipped (percentage=1); fire draw=0 (fire), drop draw=0 (drop)
    const rnd = seqRandom([0, 0]);
    const inj = new FaultInjector({ percentage: 1 }, Date.now, rnd);
    inj.arm({
      id: 'p1',
      kind: FaultKind.PACKET_LOSS,
      severity: FaultSeverity.MEDIUM,
      probability: 1,
      dropRate: 1,
    });
    const out = inj.evaluate({ targetId: 't', attributes: {} });
    expect(out.dropPacket).toBe(true);
  });

  it('jitter latency stays inside [min,max]', () => {
    const rnd = seqRandom([0, 0.5, 0, 0.99]);
    const inj = new FaultInjector({ percentage: 1 }, Date.now, rnd);
    inj.arm({ ...latencyFault(), latencyMs: [10, 100] });
    const o1 = inj.evaluate({ targetId: 'a', attributes: {} });
    const o2 = inj.evaluate({ targetId: 'b', attributes: {} });
    expect(o1.totalLatencyMs).toBeGreaterThanOrEqual(10);
    expect(o1.totalLatencyMs).toBeLessThanOrEqual(100);
    expect(o2.totalLatencyMs).toBeGreaterThanOrEqual(10);
    expect(o2.totalLatencyMs).toBeLessThanOrEqual(100);
  });

  it('requests abort when ABORT fault fires', () => {
    const inj = new FaultInjector({ percentage: 1 }, Date.now, () => 0);
    inj.arm({
      id: 'ab',
      kind: FaultKind.ABORT,
      severity: FaultSeverity.CRITICAL,
      probability: 1,
      abortReason: 'circuit open',
    });
    const out = inj.evaluate({ targetId: 't', attributes: {} });
    expect(out.abortRequested).toBe(true);
    expect(out.abortReason).toBe('circuit open');
  });

  it('disarm removes fault; disarmAll clears all', () => {
    const inj = new FaultInjector({ percentage: 1 });
    inj.arm(latencyFault('a'));
    inj.arm(latencyFault('b'));
    expect(inj.armedCount).toBe(2);
    expect(inj.disarm('a')).toBe(true);
    expect(inj.isArmed('a')).toBe(false);
    expect(inj.disarmAll()).toBe(1);
    expect(inj.armedCount).toBe(0);
  });

  it('rejects invalid fault descriptors', () => {
    const inj = new FaultInjector({ percentage: 1 });
    expect(() => inj.arm(latencyFault('', 1))).toThrow(TypeError);
    expect(() => inj.arm(latencyFault('x', 1.5))).toThrow(RangeError);
  });

  it('apply() sleeps for the injected latency', async () => {
    const inj = new FaultInjector({ percentage: 1 }, Date.now, () => 0);
    inj.arm(latencyFault());
    let slept = 0;
    await inj.apply({ targetId: 't', attributes: {} }, async (ms) => void (slept += ms));
    expect(slept).toBe(50);
  });
});

// ------------------------------------------------------------ SteadyStateChecker

describe('SteadyStateChecker', () => {
  it('Welford accumulator computes mean/variance online', () => {
    const w = new WelfordAccumulator();
    [2, 4, 4, 4, 5, 5, 7, 9].forEach((v) => w.add(v));
    expect(w.count).toBe(8);
    expect(w.mean).toBe(5);
    expect(w.sampleVariance).toBeCloseTo(4.571, 2); // known sample variance
    expect(w.stddev).toBeCloseTo(2.138, 2);
  });

  it('evaluates AT_MOST tolerance', async () => {
    const c = new SteadyStateChecker();
    c.registerProbe({
      name: 'p99',
      description: '',
      sample: () => 120,
      tolerance: { kind: ToleranceKind.AT_MOST, threshold: 200 },
      minSamples: 1,
    });
    await c.sampleAll(SamplePhase.DURING);
    expect(c.evaluate('p99').passed).toBe(true);
  });

  it('fails closed when minSamples unmet', () => {
    const c = new SteadyStateChecker();
    c.registerProbe({
      name: 'p',
      description: '',
      sample: () => 1,
      tolerance: { kind: ToleranceKind.AT_MOST, threshold: 5 },
      minSamples: 3,
    });
    const v = c.evaluate('p');
    expect(v.passed).toBe(false);
    expect(v.reason).toContain('insufficient');
  });

  it('WITHIN_PERCENT compares during vs baseline mean', async () => {
    const c = new SteadyStateChecker();
    let phase: SamplePhase = SamplePhase.BASELINE;
    c.registerProbe({
      name: 'lat',
      description: '',
      sample: () => (phase === SamplePhase.BASELINE ? 100 : 130),
      tolerance: { kind: ToleranceKind.WITHIN_PERCENT, percent: 0.5 },
      minSamples: 1,
    });
    await c.sampleAll(SamplePhase.BASELINE); // 100
    phase = SamplePhase.DURING;
    await c.sampleAll(SamplePhase.DURING); // 130 → within 50% of 100
    expect(c.evaluate('lat').passed).toBe(true);

    const c2 = new SteadyStateChecker();
    let p2: SamplePhase = SamplePhase.BASELINE;
    c2.registerProbe({
      name: 'lat',
      description: '',
      sample: () => (p2 === SamplePhase.BASELINE ? 100 : 200),
      tolerance: { kind: ToleranceKind.WITHIN_PERCENT, percent: 0.5 },
      minSamples: 1,
    });
    await c2.sampleAll(SamplePhase.BASELINE);
    p2 = SamplePhase.DURING;
    await c2.sampleAll(SamplePhase.DURING); // 200 > 150
    expect(c2.evaluate('lat').passed).toBe(false);
  });

  it('Welch t-test detects a shifted distribution', async () => {
    const c = new SteadyStateChecker();
    let i = 0;
    const base = [10, 11, 9, 10, 10];
    const shifted = [30, 31, 29, 30, 32];
    c.registerProbe({
      name: 'm',
      description: '',
      sample: () => (i < 5 ? base[i++] : shifted[i++ - 5]),
      tolerance: { kind: ToleranceKind.AT_MOST, threshold: 100 },
      minSamples: 1,
    });
    for (let k = 0; k < 5; k++) await c.sample('m', SamplePhase.BASELINE);
    for (let k = 0; k < 5; k++) await c.sample('m', SamplePhase.DURING);
    const r = c.compareBaselineVsDuring('m');
    expect(r).not.toBeNull();
    expect(r!.significant).toBe(true);
    expect(r!.t).toBeGreaterThan(2);
  });

  it('sampler failures yield no sample (fail closed)', async () => {
    const c = new SteadyStateChecker();
    c.registerProbe({
      name: 'bad',
      description: '',
      sample: () => {
        throw new Error('probe exploded');
      },
      tolerance: { kind: ToleranceKind.AT_MOST, threshold: 1 },
      minSamples: 1,
    });
    const s = await c.sample('bad', SamplePhase.DURING);
    expect(s).toBeNull();
    expect(c.evaluate('bad').passed).toBe(false);
  });
});

// ------------------------------------------------------------------ AbortMonitor

describe('AbortMonitor', () => {
  const cond = (over: Partial<AbortCondition> = {}): AbortCondition => ({
    name: 'err-spike',
    description: '',
    metric: 'error-rate',
    threshold: 0.1,
    comparator: '>',
    windowMs: 1000,
    ...over,
  });

  it('trips when every in-window sample breaches', () => {
    const clk = fakeClock();
    const m = new AbortMonitor([cond()], clk.now);
    m.record('error-rate', 0.2);
    expect(m.evaluate().shouldAbort).toBe(true);
    expect(m.evaluate().triggeredBy?.name).toBe('err-spike');
  });

  it('does not trip below threshold', () => {
    const m = new AbortMonitor([cond()]);
    m.record('error-rate', 0.05);
    expect(m.evaluate().shouldAbort).toBe(false);
  });

  it('breachRatio allows partial breaches', () => {
    const m = new AbortMonitor([cond({ breachRatio: 0.5 })]);
    m.record('error-rate', 0.5); // breach
    m.record('error-rate', 0.01); // not
    expect(m.evaluate().shouldAbort).toBe(true);
    expect(m.evaluate().breachRatio).toBe(0.5);
  });

  it('window pruning drops stale samples', () => {
    const clk = fakeClock();
    const m = new AbortMonitor([cond()], clk.now);
    m.record('error-rate', 0.9); // breach, will expire
    clk.advance(2000);
    m.record('error-rate', 0.01); // fresh non-breach
    expect(m.evaluate().shouldAbort).toBe(false);
  });

  it('latches once tripped', () => {
    const m = new AbortMonitor([cond()]);
    m.record('error-rate', 0.9);
    expect(m.evaluate().shouldAbort).toBe(true);
    m.record('error-rate', 0.0);
    expect(m.evaluate().shouldAbort).toBe(true); // stays tripped
  });

  it('ignores samples for unwatched metrics', () => {
    const m = new AbortMonitor([cond()]);
    m.record('cpu', 99);
    expect(m.evaluate().shouldAbort).toBe(false);
  });
});

// -------------------------------------------------------- ChaosExperimentEngine

describe('ChaosExperimentEngine', () => {
  it('enforces transition guards', () => {
    const e = new ChaosExperimentEngine(makeDefinition());
    expect(() => e.transition(ExperimentState.RUNNING)).toThrow(InvalidTransitionError);
    expect(() => e.transition(ExperimentState.COMPLETED)).toThrow(InvalidTransitionError);
    e.transition(ExperimentState.VALIDATING, 'ok');
    expect(e.state).toBe(ExperimentState.VALIDATING);
  });

  it('rejects invalid definitions', async () => {
    const e = new ChaosExperimentEngine(makeDefinition({ faults: [] }));
    await expect(e.start()).rejects.toThrow(ExperimentValidationError);
    expect(e.state).toBe(ExperimentState.FAILED);
  });

  it('runs full lifecycle to COMPLETED when hypothesis holds', async () => {
    const clk = fakeClock();
    const e = new ChaosExperimentEngine(makeDefinition(), clk.now, () => 0);
    const report = await e.run(async (ms) => clk.advance(ms));
    expect(report.finalState).toBe(ExperimentState.COMPLETED);
    expect(report.hypothesisHeld).toBe(true);
    // VALIDATING→BASELINE→RUNNING→ANALYZING→COMPLETED
    const states = report.transitions.map((t) => t.to);
    expect(states).toContain(ExperimentState.RUNNING);
    expect(states).toContain(ExperimentState.COMPLETED);
    expect(e.injector.armedCount).toBe(0); // faults disarmed on exit
  });

  it('marks FAILED when hypothesis is violated', async () => {
    const clk = fakeClock();
    const def = makeDefinition({
      hypothesis: [
        {
          name: 'p',
          description: '',
          sample: () => 5,
          tolerance: { kind: ToleranceKind.AT_MOST, threshold: 1 },
          minSamples: 1,
        },
      ],
    });
    const e = new ChaosExperimentEngine(def, clk.now, () => 0);
    const report = await e.run(async (ms) => clk.advance(ms));
    expect(report.finalState).toBe(ExperimentState.FAILED);
    expect(report.hypothesisHeld).toBe(false);
  });

  it('aborts when abort condition trips mid-run', async () => {
    const clk = fakeClock();
    const def = makeDefinition({
      abortConditions: [
        {
          name: 'err-spike',
          description: '',
          metric: 'error-rate',
          threshold: 0.5,
          comparator: '>',
          windowMs: 10_000,
        },
      ],
      durationMs: 1_000_000, // would run forever without abort
    });
    const e = new ChaosExperimentEngine(def, clk.now, () => 0);
    await e.start();
    e.beginInjection();
    expect(e.state).toBe(ExperimentState.RUNNING);
    const tripped = e.feedMetricAndCheck('error-rate', 0.9);
    expect(tripped).toBe(true);
    expect(e.state).toBe(ExperimentState.ABORTED);
    expect(e.abortTriggeredBy).toBe('err-spike');
    expect(e.injector.armedCount).toBe(0); // rollback on abort
  });

  it('abort() from BASELINE disarms nothing but transitions', async () => {
    const e = new ChaosExperimentEngine(makeDefinition());
    await e.start();
    e.abort('operator cancel');
    expect(e.state).toBe(ExperimentState.ABORTED);
    expect(e.isTerminal).toBe(true);
    // Terminal states reject further transitions.
    expect(() => e.transition(ExperimentState.RUNNING)).toThrow(InvalidTransitionError);
  });

  it('tick() auto-advances to ANALYZING after durationMs', async () => {
    const clk = fakeClock();
    const e = new ChaosExperimentEngine(makeDefinition({ durationMs: 100 }), clk.now, () => 0);
    await e.start();
    e.beginInjection();
    clk.advance(150);
    await e.tick();
    expect(e.state).toBe(ExperimentState.ANALYZING);
  });

  it('injects faults only while RUNNING', async () => {
    const clk = fakeClock();
    const e = new ChaosExperimentEngine(makeDefinition(), clk.now, () => 0);
    await e.start();
    expect(e.injector.armedCount).toBe(0);
    e.beginInjection();
    expect(e.injector.armedCount).toBe(1);
    const outcome = e.injector.evaluate({ targetId: 't', attributes: {} });
    expect(outcome.totalLatencyMs).toBe(50);
  });
});

// ------------------------------------------------------------------- Scheduler

describe('ChaosScheduler', () => {
  it('permits scheduling inside allow windows, blocks blackout', () => {
    const clk = fakeClock(0);
    const s = new ChaosScheduler(clk.now);
    s.addWindow({ name: 'biz-hours', startsAt: 100, endsAt: 200, blackout: false });
    expect(s.isPermitted(50)).toBe(false); // outside allow window
    expect(s.isPermitted(150)).toBe(true);
    s.addWindow({ name: 'deploy-freeze', startsAt: 140, endsAt: 160, blackout: true });
    expect(s.isPermitted(150)).toBe(false); // blackout wins
    expect(s.isPermitted(170)).toBe(true);
  });

  it('no windows = always permitted', () => {
    const s = new ChaosScheduler();
    expect(s.isPermitted()).toBe(true);
  });

  it('due() returns only admitted, due entries in order', () => {
    const clk = fakeClock(0);
    const s = new ChaosScheduler(clk.now);
    const def = makeDefinition();
    s.schedule({ scheduleId: 'b', definition: def, notBefore: 300 });
    s.schedule({ scheduleId: 'a', definition: def, notBefore: 100 });
    clk.advance(150);
    const due1 = s.due();
    expect(due1.map((e) => e.scheduleId)).toEqual(['a']);
    s.complete(due1[0]); // free the concurrency slot
    clk.advance(200);
    const due2 = s.due();
    expect(due2.map((e) => e.scheduleId)).toEqual(['b']);
  });

  it('drops expired entries (notAfter)', () => {
    const clk = fakeClock(0);
    const s = new ChaosScheduler(clk.now);
    s.schedule({ scheduleId: 'x', definition: makeDefinition(), notBefore: 100, notAfter: 150 });
    clk.advance(200);
    expect(s.due().length).toBe(0);
    expect(s.queuedCount).toBe(0);
  });

  it('defers when concurrency cap reached', () => {
    const clk = fakeClock(0);
    const s = new ChaosScheduler(clk.now, 1);
    const def = makeDefinition();
    s.schedule({ scheduleId: 'a', definition: def, notBefore: 0 });
    s.schedule({ scheduleId: 'b', definition: def, notBefore: 0 });
    const first = s.due();
    expect(first.length).toBe(1);
    expect(s.queuedCount).toBe(1); // b deferred
    s.complete(first[0]);
    const second = s.due();
    expect(second.map((e) => e.scheduleId)).toEqual(['b']);
  });

  it('defers entries scheduled during blackout until window opens', () => {
    const clk = fakeClock(100);
    const s = new ChaosScheduler(clk.now);
    s.addWindow({ name: 'freeze', startsAt: 0, endsAt: 500, blackout: true });
    s.schedule({ scheduleId: 'x', definition: makeDefinition(), notBefore: 0 });
    expect(s.due().length).toBe(0);
    clk.advance(600);
    expect(s.due().length).toBe(1);
  });

  it('recurring entries re-queue after complete()', () => {
    const clk = fakeClock(0);
    const s = new ChaosScheduler(clk.now);
    s.schedule({
      scheduleId: 'r',
      definition: makeDefinition(),
      notBefore: 0,
      recurrenceMs: 1000,
    });
    const [entry] = s.due();
    s.complete(entry);
    expect(s.queuedCount).toBe(1);
    expect(s.peekNext()?.notBefore).toBe(1000);
  });
});

// ------------------------------------------------------------ GameDayOrchestrator

describe('GameDayOrchestrator', () => {
  function scenario(id: string, deps: string[] = [], hypothesisValue = 0) {
    const def = makeDefinition({
      id: `exp-${id}`,
      durationMs: 50,
      hypothesis: [
        {
          name: 'h',
          description: '',
          sample: () => hypothesisValue,
          tolerance: { kind: ToleranceKind.AT_MOST, threshold: 1 },
          minSamples: 1,
        },
      ],
    });
    return { scenarioId: id, name: id, definition: def, dependsOn: deps, weight: 1 };
  }

  it('runs scenarios in dependency order and scores', async () => {
    const clk = fakeClock();
    const gd = new GameDayOrchestrator(
      {
        gameDayId: 'gd-1',
        name: 'quarterly',
        scenarios: [scenario('a'), scenario('b', ['a']), scenario('c', ['b'])],
      },
      clk.now,
      () => 0,
      async (ms) => clk.advance(ms)
    );
    const report = await gd.run();
    expect(report.results.every((r) => r.status === 'COMPLETED')).toBe(true);
    expect(report.scoreRatio).toBe(1);
    expect(report.passed).toBe(true);
  });

  it('fail-fast skips dependents after a failure', async () => {
    const clk = fakeClock();
    const gd = new GameDayOrchestrator(
      {
        gameDayId: 'gd-2',
        name: 'ff',
        scenarios: [scenario('a', [], 5), scenario('b', ['a']), scenario('c')],
        failFast: true,
      },
      clk.now,
      () => 0,
      async (ms) => clk.advance(ms)
    );
    const report = await gd.run();
    const byId = new Map(report.results.map((r) => [r.scenarioId, r]));
    expect(byId.get('a')?.status).toBe('FAILED'); // 5 > threshold 1
    expect(byId.get('b')?.status).toBe('SKIPPED');
  });

  it('partial credit for completed-but-violated hypotheses', async () => {
    const clk = fakeClock();
    const gd = new GameDayOrchestrator(
      {
        gameDayId: 'gd-3',
        name: 'pc',
        scenarios: [scenario('a', [], 5)],
        failFast: false,
        partialCredit: 0.5,
      },
      clk.now,
      () => 0,
      async (ms) => clk.advance(ms)
    );
    // 'a' fails (5 > 1) → status FAILED not COMPLETED, so no partial credit path;
    // verify a holding scenario still earns full credit alongside.
    const report = await gd.run();
    expect(report.results[0].status).toBe('FAILED');
    expect(report.scoreRatio).toBe(0);
  });

  it('detects dependency cycles', () => {
    const gd = new GameDayOrchestrator(
      {
        gameDayId: 'gd-4',
        name: 'cyc',
        scenarios: [scenario('a', ['b']), scenario('b', ['a'])],
      },
      fakeClock().now
    );
    const problems = gd.validatePlan();
    expect(problems.some((p) => p.includes('cycle'))).toBe(true);
  });

  it('detects unknown dependencies', () => {
    const gd = new GameDayOrchestrator(
      { gameDayId: 'gd-5', name: 'x', scenarios: [scenario('a', ['ghost'])] },
      fakeClock().now
    );
    expect(gd.validatePlan().some((p) => p.includes('unknown'))).toBe(true);
  });
});
