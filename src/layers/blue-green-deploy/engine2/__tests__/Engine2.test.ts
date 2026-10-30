/**
 * Tests for the BlueGreenDeploy Engine2 modules.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { planWaves, waveIndexOf, CycleError, WavePlanError } from '../WavePlanner';
import { checkParity } from '../ParityChecker';
import { SmokeRunner } from '../SmokeRunner';
import { compareWindows } from '../TrafficAnalysis';
import { InstantRollback } from '../InstantRollback';
import { ManualBgClock2 } from '../types';
import type { EnvVarEntry, ServiceNode } from '../types';

let clock: ManualBgClock2;

beforeEach(() => {
  clock = new ManualBgClock2(1_000_000);
});

// ---------------------------------------------------------------------
// Wave planning
// ---------------------------------------------------------------------

describe('WavePlanner', () => {
  it('schedules dependencies before dependents in waves', () => {
    const services: ServiceNode[] = [
      { name: 'web', dependsOn: ['api'] },
      { name: 'api', dependsOn: ['db'] },
      { name: 'db', dependsOn: [] },
      { name: 'worker', dependsOn: ['api'] },
    ];
    const plan = planWaves(services);
    expect(plan.waves.map((w) => w.services)).toEqual([
      ['db'],
      ['api'],
      ['web', 'worker'],
    ]);
    expect(plan.order.indexOf('db')).toBeLessThan(plan.order.indexOf('api'));
    expect(plan.cyclic).toEqual([]);
  });

  it('batches independent services in one wave', () => {
    const plan = planWaves([
      { name: 'a', dependsOn: [] },
      { name: 'b', dependsOn: [] },
      { name: 'c', dependsOn: ['a', 'b'] },
    ]);
    expect(plan.waves.length).toBe(2);
    expect(plan.waves[0]?.services).toEqual(['a', 'b']);
    expect(plan.waves[1]?.services).toEqual(['c']);
  });

  it('throws CycleError on a dependency cycle', () => {
    expect(() =>
      planWaves([
        { name: 'a', dependsOn: ['b'] },
        { name: 'b', dependsOn: ['c'] },
        { name: 'c', dependsOn: ['a'] },
      ])
    ).toThrow(CycleError);
  });

  it('strict=false returns the cyclic set and schedules the rest', () => {
    const plan = planWaves(
      [
        { name: 'ok', dependsOn: [] },
        { name: 'a', dependsOn: ['b'] },
        { name: 'b', dependsOn: ['a'] },
      ],
      { strict: false }
    );
    expect(plan.cyclic.sort()).toEqual(['a', 'b']);
    expect(plan.order).toEqual(['ok']);
  });

  it('rejects unknown dependencies and duplicate services', () => {
    expect(() => planWaves([{ name: 'a', dependsOn: ['ghost'] }])).toThrow(WavePlanError);
    expect(() =>
      planWaves([
        { name: 'a', dependsOn: [] },
        { name: 'a', dependsOn: [] },
      ])
    ).toThrow(WavePlanError);
  });

  it('waveIndexOf maps services to their wave', () => {
    const plan = planWaves([
      { name: 'db', dependsOn: [] },
      { name: 'api', dependsOn: ['db'] },
    ]);
    const idx = waveIndexOf(plan);
    expect(idx.get('db')).toBe(0);
    expect(idx.get('api')).toBe(1);
  });
});

// ---------------------------------------------------------------------
// Parity
// ---------------------------------------------------------------------

describe('ParityChecker', () => {
  const entry = (key: string, value?: string, secret = false, hash?: string): EnvVarEntry =>
    ({ key, value, secret, hash });

  it('matched environments report ok', () => {
    const blue = [entry('A', '1'), entry('SECRET', undefined, true, 'h1')];
    const green = [entry('A', '1'), entry('SECRET', undefined, true, 'h1')];
    const r = checkParity(blue, green);
    expect(r.ok).toBe(true);
    expect(r.comparedKeys).toBe(2);
    expect(r.issues).toEqual([]);
  });

  it('flags missing keys on either side without leaking secret values', () => {
    const blue = [entry('ONLY_BLUE', 'x'), entry('S', undefined, true, 'h')];
    const green = [entry('ONLY_GREEN', 'y')];
    const r = checkParity(blue, green);
    const kinds = r.issues.map((i) => i.kind).sort();
    // ONLY_BLUE and S live only on blue → green is missing them;
    // ONLY_GREEN lives only on green → blue is missing it.
    expect(kinds).toEqual(['missing-in-blue', 'missing-in-green', 'missing-in-green']);
    const secretIssue = r.issues.find((i) => i.key === 'S');
    expect(secretIssue?.blueValue).toBeUndefined();
  });

  it('compares secrets by hash, values literally', () => {
    const blue = [entry('S1', undefined, true, 'h1'), entry('V', 'a')];
    const green = [entry('S1', undefined, true, 'h2'), entry('V', 'b')];
    const r = checkParity(blue, green);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.kind).sort()).toEqual(['hash-differs', 'value-differs']);
    const v = r.issues.find((i) => i.key === 'V');
    expect(v?.blueValue).toBe('a');
    expect(v?.greenValue).toBe('b');
  });

  it('unhashable secrets (missing hash) flag as issues', () => {
    const blue = [entry('S', undefined, true, undefined)];
    const green = [entry('S', undefined, true, 'h')];
    const r = checkParity(blue, green);
    expect(r.issues[0]?.kind).toBe('hash-differs');
  });

  it('ignore patterns suppress intentional skew', () => {
    const blue = [entry('STACK_COLOR', 'blue'), entry('DB_HOST', 'h'), entry('REVISION', 'r1')];
    const green = [entry('STACK_COLOR', 'green'), entry('DB_HOST', 'h'), entry('REVISION', 'r2')];
    const r = checkParity(blue, green, ['*_COLOR', 'REVISION']);
    expect(r.ok).toBe(true);
    expect(r.ignoredKeys.sort()).toEqual(['REVISION', 'STACK_COLOR']);
  });
});

// ---------------------------------------------------------------------
// Smoke tests
// ---------------------------------------------------------------------

describe('SmokeRunner', () => {
  it('runs checks in order and reports details', async () => {
    const order: string[] = [];
    const runner = new SmokeRunner(
      [
        { name: 'health', run: () => void order.push('h') },
        { name: 'deep', run: () => void order.push('d') || 'checked 3 routes' },
      ],
      clock
    );
    const r = await runner.run();
    expect(order).toEqual(['h', 'd']);
    expect(r.ok).toBe(true);
    expect(r.results[1]?.detail).toBe('checked 3 routes');
  });

  it('aborts on a failing required check', async () => {
    const ran: string[] = [];
    const runner = new SmokeRunner(
      [
        { name: 'up', run: () => { throw new Error('502'); } },
        { name: 'deep', run: () => void ran.push('d') },
      ],
      clock
    );
    const r = await runner.run();
    expect(r.ok).toBe(false);
    expect(r.aborted).toBe(true);
    expect(ran).toEqual([]);
    expect(r.results[0]?.error).toBe('502');
  });

  it('continues past failing non-required checks', async () => {
    const ran: string[] = [];
    const runner = new SmokeRunner(
      [
        { name: 'advisory', required: false, run: () => false },
        { name: 'core', run: () => void ran.push('core') },
      ],
      clock
    );
    const r = await runner.run();
    expect(ran).toEqual(['core']);
    expect(r.aborted).toBe(false);
    expect(r.ok).toBe(false); // a failure still fails the report
  });

  it('marks checks exceeding their timeout as failed', async () => {
    const runner = new SmokeRunner(
      [{ name: 'slow', timeoutMs: 100, run: () => { clock.advance(200); } }],
      clock
    );
    const r = await runner.run();
    expect(r.results[0]?.timedOut).toBe(true);
    expect(r.results[0]?.ok).toBe(false);
    expect(r.results[0]?.error).toContain('timeout');
  });
});

// ---------------------------------------------------------------------
// Traffic analysis
// ---------------------------------------------------------------------

describe('TrafficAnalysis', () => {
  it('green within tolerance → stay', () => {
    const r = compareWindows(
      { requests: 10_000, errors: 100 },
      { requests: 2_000, errors: 22 }
    );
    expect(r.greenWorse).toBe(false);
    expect(r.recommendation).toBe('stay');
    expect(r.errorRateRatio).toBeCloseTo(1.1);
  });

  it('absolute delta catches a big jump', () => {
    const r = compareWindows(
      { requests: 10_000, errors: 50 }, // 0.5%
      { requests: 2_000, errors: 80 } // 4%
    );
    expect(r.greenWorse).toBe(true);
    expect(r.recommendation).toBe('rollback');
    expect(r.errorRateDelta).toBeCloseTo(0.035);
  });

  it('relative lift catches a doubling inside delta tolerance', () => {
    const r = compareWindows(
      { requests: 100_000, errors: 10 }, // 0.01%
      { requests: 60_000, errors: 15 } // 0.025% — delta 0.015pp < 2pp but 2.5×
    );
    expect(r.greenWorse).toBe(true);
    expect(r.reason).toContain('lift');
  });

  it('zero blue errors + any green errors → infinite lift, rollback', () => {
    const r = compareWindows(
      { requests: 10_000, errors: 0 },
      { requests: 2_000, errors: 2 }
    );
    expect(r.greenWorse).toBe(true);
    expect(r.errorRateRatio).toBeNull();
    expect(r.recommendation).toBe('rollback');
  });

  it('below the min-request floor → no judgement, stay', () => {
    const r = compareWindows(
      { requests: 10_000, errors: 0 },
      { requests: 10, errors: 5 } // terrible rate but tiny window
    );
    expect(r.greenWorse).toBe(false);
    expect(r.recommendation).toBe('stay');
    expect(r.reason).toContain('insufficient');
  });

  it('custom policy knobs are honoured', () => {
    const r = compareWindows(
      { requests: 1000, errors: 10 },
      { requests: 1000, errors: 11 },
      { minRequests: 10, maxRatio: 100, toleranceDelta: 0.5 }
    );
    expect(r.greenWorse).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Instant rollback
// ---------------------------------------------------------------------

describe('InstantRollback', () => {
  const services: ServiceNode[] = [
    { name: 'db', dependsOn: [] },
    { name: 'api', dependsOn: ['db'] },
    { name: 'web', dependsOn: ['api'] },
  ];

  it('restores in reverse wave order — dependents first', async () => {
    const plan = planWaves(services);
    const rb = new InstantRollback(plan, clock);
    for (const s of plan.order) rb.capture(s, { image: `${s}:old` });
    expect(rb.ready).toBe(true);

    const restored: string[] = [];
    const report = await rb.rollback((svc) => void restored.push(svc));
    expect(report.ok).toBe(true);
    expect(restored).toEqual(['web', 'api', 'db']); // wave 2 → wave 0
  });

  it('reports missing snapshots instead of silently skipping', async () => {
    const plan = planWaves(services);
    const rb = new InstantRollback(plan, clock);
    rb.capture('db', { image: 'db:old' });
    rb.capture('api', { image: 'api:old' });
    expect(rb.ready).toBe(false);
    expect(rb.missing()).toEqual(['web']);
    const report = await rb.rollback(() => {});
    expect(report.ok).toBe(false);
    expect(report.manual).toEqual(['web']);
  });

  it('a failed restore does not halt remaining restores', async () => {
    const plan = planWaves(services);
    const rb = new InstantRollback(plan, clock);
    for (const s of plan.order) rb.capture(s, {});
    const restored: string[] = [];
    const report = await rb.rollback((svc) => {
      if (svc === 'api') throw new Error('stuck');
      restored.push(svc);
    });
    expect(restored).toEqual(['web', 'db']);
    expect(report.manual).toEqual(['api']);
    const apiStep = report.steps.find((s) => s.service === 'api');
    expect(apiStep?.error).toBe('stuck');
  });

  it('restores the captured state, not something else', async () => {
    const plan = planWaves([{ name: 'svc', dependsOn: [] }]);
    const rb = new InstantRollback(plan, clock);
    rb.capture('svc', { image: 'v1.2.3', replicas: 4 });
    clock.advance(60_000);
    let got: unknown;
    await rb.rollback((_s, state) => {
      got = state;
    });
    expect(got).toEqual({ image: 'v1.2.3', replicas: 4 });
  });
});

// ---------------------------------------------------------------------
// Switch orchestrator
// ---------------------------------------------------------------------

import { SwitchOrchestrator } from '../SwitchOrchestrator';
import type { SwitchEnvironment } from '../SwitchOrchestrator';
import { planWaves } from '../WavePlanner';

function env(over: Partial<SwitchEnvironment> = {}): SwitchEnvironment {
  return {
    blueEnv: () => [{ key: 'A', value: '1', secret: false }],
    greenEnv: () => [{ key: 'A', value: '1', secret: false }],
    capture: (svc) => ({ image: `${svc}:old` }),
    deployWave: () => {},
    traffic: () => ({ blue: { requests: 1000, errors: 10 }, green: { requests: 500, errors: 5 } }),
    restore: () => {},
    ...over,
  };
}

const twoWaves = planWaves([
  { name: 'db', dependsOn: [] },
  { name: 'api', dependsOn: ['db'] },
]);

describe('SwitchOrchestrator', () => {
  it('commits when every gate passes', async () => {
    const order: string[] = [];
    const o = new SwitchOrchestrator(
      env({ deployWave: (svcs) => void order.push(...svcs) }),
      twoWaves,
      clock
    );
    const out = await o.run();
    expect(out.ok).toBe(true);
    expect(out.gate).toBe('committed');
    expect(order).toEqual(['db', 'api']); // dependencies first
  });

  it('halts at parity — green never deploys', async () => {
    let deployed = 0;
    const o = new SwitchOrchestrator(
      env({
        greenEnv: () => [{ key: 'A', value: 'DIFFERENT', secret: false }],
        deployWave: () => void deployed++,
      }),
      twoWaves,
      clock
    );
    const out = await o.run();
    expect(out.gate).toBe('parity');
    expect(out.ok).toBe(false);
    expect(deployed).toBe(0);
  });

  it('rolls back on smoke failure', async () => {
    const restored: string[] = [];
    const o = new SwitchOrchestrator(
      env({ restore: (svc) => void restored.push(svc) }),
      twoWaves,
      clock
    );
    const out = await o.run({
      smokeTests: [{ name: 'health', run: () => { throw new Error('down'); } }],
    });
    expect(out.gate).toBe('smoke');
    expect(out.ok).toBe(false);
    // Rollback happened in reverse order.
    expect(restored).toEqual(['api', 'db']);
  });

  it('rolls back when traffic marks green worse', async () => {
    const restored: string[] = [];
    const o = new SwitchOrchestrator(
      env({
        restore: (svc) => void restored.push(svc),
        traffic: () => ({
          blue: { requests: 10_000, errors: 10 },
          green: { requests: 2_000, errors: 50 },
        }),
      }),
      twoWaves,
      clock
    );
    const out = await o.run();
    expect(out.gate).toBe('rolledback');
    expect(restored.length).toBe(2);
    expect(out.rollback?.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Config differ
// ---------------------------------------------------------------------

import { diffConfigs, summarize } from '../ConfigDiffer';

describe('ConfigDiffer', () => {
  it('reports added, removed and changed leaves with paths', () => {
    const blue = {
      db: { host: 'a', pool: 4 },
      features: { checkout: true, search: false },
      region: 'eu',
    };
    const green = {
      db: { host: 'a', pool: 8 },
      features: { checkout: true },
      region: 'eu',
      rollout: { canary: 5 },
    };
    const diffs = diffConfigs(blue, green);
    const by = new Map(diffs.map((d) => [d.path, d]));
    expect(by.get('db.pool')?.kind).toBe('changed');
    expect(by.get('features.search')?.kind).toBe('removed');
    expect(by.get('rollout')?.kind).toBe('added');
    expect(summarize(diffs)).toEqual({ added: 1, removed: 1, changed: 1, 'type-changed': 0 });
  });

  it('arrays compare positionally; element changes surface with index paths', () => {
    const diffs = diffConfigs(
      { servers: [{ host: 'a' }, { host: 'b' }] },
      { servers: [{ host: 'a' }, { host: 'c' }, { host: 'd' }] }
    );
    expect(diffs.map((d) => `${d.path}:${d.kind}`)).toEqual([
      'servers[1].host:changed',
      'servers[2]:added',
    ]);
  });

  it('object↔scalar swaps report type-changed, not a leaf diff', () => {
    const diffs = diffConfigs({ x: { a: 1 } }, { x: 5 });
    expect(diffs).toEqual([{ path: 'x', kind: 'type-changed', blue: { a: 1 }, green: 5 }]);
  });

  it('identical trees produce no diffs', () => {
    expect(diffConfigs({ a: { b: [1, 2] } }, { a: { b: [1, 2] } })).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Traffic sampler
// ---------------------------------------------------------------------

import { TrafficSampler } from '../TrafficSampler';

describe('TrafficSampler', () => {
  it('sums the trailing window per side', () => {
    const s = new TrafficSampler(60_000, clock);
    s.record('blue', 100, 2);
    s.record('blue', 100, 1);
    clock.advance(30_000);
    s.record('blue', 50, 0);
    const w = s.sample('blue');
    expect(w).toEqual({ requests: 250, errors: 3 });
  });

  it('evicts events older than the window', () => {
    const s = new TrafficSampler(10_000, clock);
    s.record('blue', 100, 5);
    clock.advance(11_000);
    s.record('blue', 10, 0);
    const w = s.sample('blue');
    expect(w).toEqual({ requests: 10, errors: 0 });
  });

  it('sides are independent', () => {
    const s = new TrafficSampler(60_000, clock);
    s.record('blue', 100, 1);
    s.record('green', 50, 4);
    expect(s.pair()).toEqual({
      blue: { requests: 100, errors: 1 },
      green: { requests: 50, errors: 4 },
    });
  });
});

// ---------------------------------------------------------------------
// Wave executor
// ---------------------------------------------------------------------

import { WaveExecutor } from '../WaveExecutor';

describe('WaveExecutor', () => {
  it('deploys waves in order and reports each', async () => {
    const plan = planWaves([
      { name: 'db', dependsOn: [] },
      { name: 'api', dependsOn: ['db'] },
      { name: 'web', dependsOn: ['api'] },
    ]);
    const order: string[] = [];
    const r = await new WaveExecutor(plan, clock).run(
      (svcs) => void order.push(...svcs)
    );
    expect(r.ok).toBe(true);
    expect(order).toEqual(['db', 'api', 'web']);
    expect(r.outcomes.map((o) => o.status)).toEqual(['deployed', 'deployed', 'deployed']);
  });

  it('a deploy failure halts — later waves stay skipped', async () => {
    const plan = planWaves([
      { name: 'db', dependsOn: [] },
      { name: 'api', dependsOn: ['db'] },
    ]);
    const r = await new WaveExecutor(plan, clock).run(() => {
      throw new Error('image pull failed');
    });
    expect(r.ok).toBe(false);
    expect(r.haltedAt).toBe(0);
    expect(r.outcomes[0]?.status).toBe('deploy-failed');
    expect(r.outcomes[1]?.status).toBe('skipped');
  });

  it('a failed gate stops before the next wave', async () => {
    const plan = planWaves([
      { name: 'db', dependsOn: [] },
      { name: 'api', dependsOn: ['db'] },
    ]);
    const deployed: string[] = [];
    const r = await new WaveExecutor(plan, clock).run(
      (svcs) => void deployed.push(...svcs),
      () => 'health probe timed out'
    );
    expect(r.ok).toBe(false);
    expect(deployed).toEqual(['db']); // second wave never ran
    expect(r.outcomes[0]?.status).toBe('gate-failed');
    expect(r.outcomes[0]?.detail).toBe('health probe timed out');
    expect(r.outcomes[1]?.status).toBe('skipped');
  });
});

// ---------------------------------------------------------------------
// Canary analyzer
// ---------------------------------------------------------------------

import { CanaryAnalyzer } from '../CanaryAnalyzer';

describe('CanaryAnalyzer', () => {
  const steps = [
    { share: 0.05, holdMs: 60_000 },
    { share: 0.25, holdMs: 120_000 },
    { share: 1.0, holdMs: 300_000 },
  ];

  it('advances through all steps when green stays healthy', () => {
    const a = new CanaryAnalyzer(steps);
    const r = a.analyze(() => ({
      blue: { requests: 10_000, errors: 20 },
      green: { requests: 500, errors: 1 },
    }));
    expect(r.ok).toBe(true);
    expect(r.reachedShare).toBe(1.0);
    expect(r.verdicts.length).toBe(3);
    expect(r.halted).toBe(false);
  });

  it('halts at the first degraded step and reports the reason', () => {
    const a = new CanaryAnalyzer(steps);
    let i = 0;
    const r = a.analyze(() => {
      i++;
      // Second step goes bad.
      if (i === 2) return {
        blue: { requests: 10_000, errors: 20 },
        green: { requests: 500, errors: 40 },
      };
      return {
        blue: { requests: 10_000, errors: 20 },
        green: { requests: 500, errors: 1 },
      };
    });
    expect(r.halted).toBe(true);
    expect(r.reachedShare).toBe(0.05);
    expect(r.haltReason).toContain('step 1');
    expect(r.verdicts.length).toBe(2);
    expect(r.verdicts[1]?.proceed).toBe(false);
  });

  it('small samples do not halt the canary (min-request floor)', () => {
    const a = new CanaryAnalyzer(steps);
    const r = a.analyze(() => ({
      blue: { requests: 10_000, errors: 0 },
      green: { requests: 5, errors: 3 },
    }));
    expect(r.ok).toBe(true); // insufficient green → stay, not rollback
  });

  it('rejects invalid step shares', () => {
    expect(() => new CanaryAnalyzer([{ share: 0, holdMs: 1 }])).toThrow();
    expect(() => new CanaryAnalyzer([{ share: 1.5, holdMs: 1 }])).toThrow();
    expect(() => new CanaryAnalyzer([])).toThrow();
  });
});

// ---------------------------------------------------------------------
// Config validator
// ---------------------------------------------------------------------

import { validate } from '../ConfigValidator';

describe('ConfigValidator', () => {
  const ev = (key: string, value: string, secret = false): EnvVarEntry =>
    ({ key, value, secret });

  it('validates int, positive-int, enum, url, nonempty, pattern', () => {
    const issues = validate(
      [
        ev('PORT', '8080'),
        ev('TIMEOUT_MS', '500'),
        ev('MODE', 'prod'),
        ev('API_URL', 'https://x.example'),
        ev('NAME', 'svc'),
        ev('TAG', 'v1.2-blue'),
      ],
      [
        { key: 'PORT', kind: 'int' },
        { key: 'TIMEOUT_MS', kind: 'positive-int' },
        { key: 'MODE', kind: 'enum', values: ['dev', 'prod'] },
        { key: 'API_URL', kind: 'url' },
        { key: 'NAME', kind: 'nonempty' },
        { key: 'TAG', kind: 'pattern', values: ['v*-*'] },
      ]
    );
    expect(issues).toEqual([]);
  });

  it('flags invalid values with the rule kind', () => {
    const issues = validate(
      [ev('PORT', 'not-a-number'), ev('TIMEOUT_MS', '-5'), ev('MODE', 'qa'), ev('API_URL', 'notaurl'), ev('NAME', '  ')],
      [
        { key: 'PORT', kind: 'int' },
        { key: 'TIMEOUT_MS', kind: 'positive-int' },
        { key: 'MODE', kind: 'enum', values: ['prod'] },
        { key: 'API_URL', kind: 'url' },
        { key: 'NAME', kind: 'nonempty' },
      ]
    );
    expect(issues.map((i) => i.rule).sort()).toEqual(
      ['enum', 'int', 'nonempty', 'positive-int', 'url'].sort()
    );
  });

  it('missing required key flags; optional does not', () => {
    const issues = validate(
      [],
      [
        { key: 'A', kind: 'int' },
        { key: 'B', kind: 'int', optional: true },
      ]
    );
    expect(issues.map((i) => i.key)).toEqual(['A']);
  });

  it('secrets skip value inspection', () => {
    const issues = validate(
      [{ key: 'PASSWORD', secret: true, hash: 'h' }],
      [{ key: 'PASSWORD', kind: 'nonempty' }]
    );
    expect(issues).toEqual([]);
  });
});
