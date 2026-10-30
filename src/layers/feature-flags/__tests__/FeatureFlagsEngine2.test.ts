import { describe, it, expect, beforeEach } from 'bun:test';
import { FlagDependencyGraph } from '../engine2/FlagDependencyGraph';
import { GradualRolloutScheduler, TestClock2 } from '../engine2/GradualRolloutScheduler';
import { FlagAnalytics } from '../engine2/FlagAnalytics';
import { FlagExporter } from '../engine2/FlagExporter';
import { InMemoryFlagStore } from '../implementations/FlagEvaluator';
import { boolFlag } from '../implementations/FlagEvaluator';
import type { FeatureFlag } from '../domain/flag-model';

function flag(key: string, requires: { flag: string; equals?: unknown }[] = []): FeatureFlag {
  return {
    key,
    type: 'boolean',
    enabled: true,
    variants: [
      { id: 'on', value: true },
      { id: 'off', value: false },
    ],
    defaultVariant: 'on',
    offVariant: 'off',
    requires,
  };
}

/* ------------------------------------------------------------------ */

describe('FlagDependencyGraph', () => {
  it('orders prerequisites before dependents', () => {
    const flags = [
      flag('checkout', [{ flag: 'payments' }]),
      flag('payments', [{ flag: 'billing-core' }]),
      flag('billing-core'),
      flag('unrelated'),
    ];
    const g = FlagDependencyGraph.from(flags);
    const { order, issues } = g.report(flags);
    expect(issues).toHaveLength(0);
    expect(order.indexOf('billing-core')).toBeLessThan(order.indexOf('payments'));
    expect(order.indexOf('payments')).toBeLessThan(order.indexOf('checkout'));
  });

  it('detects dependency cycles with the member list', () => {
    const flags = [
      flag('a', [{ flag: 'b' }]),
      flag('b', [{ flag: 'c' }]),
      flag('c', [{ flag: 'a' }]),
      flag('fine'),
    ];
    const { issues, order } = FlagDependencyGraph.from(flags).report(flags);
    const cycle = issues.find((i) => i.kind === 'cycle');
    expect(cycle).toBeDefined();
    expect(cycle!.flags.length).toBeGreaterThanOrEqual(3);
    expect(order).not.toContain('a');
    expect(order).toContain('fine');
  });

  it('reports requires pointing at missing flags', () => {
    const flags = [flag('orphan', [{ flag: 'ghost' }])];
    const { issues } = FlagDependencyGraph.from(flags).report(flags);
    expect(issues[0].kind).toBe('missing-flag');
    expect(issues[0].detail).toContain('ghost');
  });

  it('dependentsOf answers the blast-radius question', () => {
    const flags = [
      flag('base'),
      flag('mid', [{ flag: 'base' }]),
      flag('leaf', [{ flag: 'mid' }]),
      flag('other'),
    ];
    const deps = FlagDependencyGraph.from(flags).dependentsOf('base');
    expect(deps).toContain('mid');
    expect(deps).toContain('leaf'); // transitive
    expect(deps).not.toContain('other');
  });
});

/* ------------------------------------------------------------------ */

describe('GradualRolloutScheduler', () => {
  let clock: TestClock2;
  let sched: GradualRolloutScheduler;

  beforeEach(() => {
    clock = new TestClock2(0);
    sched = new GradualRolloutScheduler(clock);
    sched.schedule({ flagKey: 'new-ui', startPct: 10, targetPct: 100, durationMs: 90_000 });
  });

  it('ramps linearly from start to target', () => {
    expect(sched.currentPercentage('new-ui')).toBe(10); // t=0 → startPct
    clock.advance(45_000); // halfway
    const mid = sched.currentPercentage('new-ui');
    expect(mid).toBeGreaterThan(50);
    expect(mid).toBeLessThan(60);
    clock.advance(60_000); // past end
    expect(sched.currentPercentage('new-ui')).toBe(100);
    expect(sched.status('new-ui')!.state).toBe('completed');
  });

  it('respects a pre-ramp delay', () => {
    sched.schedule({ flagKey: 'delayed', startPct: 0, targetPct: 100, durationMs: 10_000, delayMs: 60_000 });
    clock.advance(30_000);
    expect(sched.currentPercentage('delayed')).toBe(0);
    expect(sched.status('delayed')!.state).toBe('scheduled');
  });

  it('pauses and resumes without losing ramp progress', () => {
    clock.advance(45_000);
    sched.pause('new-ui');
    const pausedPct = sched.currentPercentage('new-ui');
    clock.advance(500_000); // long pause
    expect(sched.currentPercentage('new-ui')).toBe(pausedPct); // frozen
    sched.resume('new-ui');
    clock.advance(45_000); // remaining half of the ramp
    expect(sched.currentPercentage('new-ui')).toBe(100);
  });

  it('halts when a guard probe breaches threshold', () => {
    let errorRate = 0;
    sched.addGuard('new-ui', () => errorRate, 0.5);
    clock.advance(30_000);
    sched.currentPercentage('new-ui'); // still fine
    errorRate = 0.9; // spike
    clock.advance(10_000);
    const s = sched.status('new-ui')!;
    expect(s.state).toBe('halted');
    expect(s.haltReason).toContain('guard');
    // Frozen — further time doesn't resume it.
    clock.advance(999_999);
    expect(sched.currentPercentage('new-ui')).toBe(s.currentPct);
  });

  it('rejects decreasing ramps (monotonicity protects bucketing)', () => {
    expect(() =>
      sched.schedule({ flagKey: 'down', startPct: 80, targetPct: 20, durationMs: 1000 })
    ).toThrow(/roll back/);
  });
});

/* ------------------------------------------------------------------ */

describe('FlagAnalytics', () => {
  let analytics: FlagAnalytics;

  beforeEach(() => {
    analytics = new FlagAnalytics({ exactLimit: 100 });
  });

  const evalFor = (flagKey: string, variant: string, user: string) => ({
    flagKey,
    value: variant,
    variant,
    reason: 'fallthrough' as const,
  });

  it('counts evaluations per variant and unique users exactly', () => {
    for (let i = 0; i < 50; i++) {
      analytics.onEvaluated(evalFor('f', i % 2 ? 'on' : 'off', `u${i % 10}`), { key: `u${i % 10}` });
    }
    const s = analytics.summary('f')!;
    expect(s.totalEvaluations).toBe(50);
    expect(s.uniqueUsers).toBe(10);
    expect(s.uniqueIsEstimate).toBe(false);
    expect(s.byVariant['on']).toBe(25);
  });

  it('estimates uniques via linear counting past the exact limit', () => {
    // 2 000 users > exactLimit 100 → switches to bitmap estimation.
    for (let i = 0; i < 2_000; i++) {
      analytics.onEvaluated(evalFor('big', 'on', `user-${i}`), { key: `user-${i}` });
    }
    const s = analytics.summary('big')!;
    expect(s.uniqueIsEstimate).toBe(true);
    // Linear counting on 8192 bits, 2000 uniques → ~1-2% error.
    expect(s.uniqueUsers).toBeGreaterThan(1_800);
    expect(s.uniqueUsers).toBeLessThan(2_200);
  });

  it('variant distribution reports share of evaluations', () => {
    for (let i = 0; i < 100; i++) {
      analytics.onEvaluated(evalFor('f', i < 80 ? 'control' : 'treatment'), {});
    }
    const dist = analytics.variantDistribution('f');
    expect(dist[0].variant).toBe('control');
    expect(dist[0].share).toBeCloseTo(0.8, 2);
  });
});

/* ------------------------------------------------------------------ */

describe('FlagExporter', () => {
  let store: InMemoryFlagStore;

  beforeEach(() => {
    store = new InMemoryFlagStore();
    store.putFlag(flag('base'));
    store.putFlag(flag('dependent', [{ flag: 'base' }]));
  });

  it('round-trips flags through JSON', () => {
    const json = FlagExporter.serialize(FlagExporter.export(store, 12345));
    const target = new InMemoryFlagStore();
    const result = FlagExporter.import(target, json);
    expect(result.ok).toBe(true);
    expect(result.flagsImported).toBe(2);
    expect(target.getFlag('dependent')!.requires![0].flag).toBe('base');
  });

  it('rejects invalid JSON', () => {
    const r = FlagExporter.import(store, '{not json');
    expect(r.ok).toBe(false);
    expect(r.issues[0].message).toContain('invalid JSON');
  });

  it('collects all validation issues in one pass', () => {
    const bad = {
      format: 'omhw/feature-flags',
      version: 1,
      flags: [
        { key: '', type: 'boolean', enabled: true }, // bad key
        { key: 'x', type: 'bogus', enabled: true }, // bad type
        {
          key: 'y',
          type: 'multivariate',
          enabled: true,
          variants: [{ id: 'a', value: 1 }],
          defaultVariant: 'nope', // unresolved variant
        },
      ],
      segments: [],
    };
    const { issues } = FlagExporter.validate(bad);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.map((i) => i.path).join()).toContain('key');
    expect(issues.map((i) => i.path).join()).toContain('type');
    expect(issues.map((i) => i.path).join()).toContain('defaultVariant');
  });

  it('rejects rollout weights summing over 100', () => {
    const bad = {
      format: 'omhw/feature-flags',
      version: 1,
      flags: [
        {
          key: 'over',
          type: 'multivariate',
          enabled: true,
          variants: [
            { id: 'a', value: 1 },
            { id: 'b', value: 2 },
          ],
          rules: [{ rollout: { weights: [{ variant: 'a', weight: 70 }, { variant: 'b', weight: 50 }] } }],
        },
      ],
      segments: [],
    };
    const { issues } = FlagExporter.validate(bad);
    expect(issues.some((i) => i.message.includes('120'))).toBe(true);
  });

  it('rejects dependency cycles on import', () => {
    const bad = {
      format: 'omhw/feature-flags',
      version: 1,
      flags: [
        flag('a', [{ flag: 'b' }]),
        flag('b', [{ flag: 'a' }]),
      ],
      segments: [],
    };
    const { issues } = FlagExporter.validate(bad);
    expect(issues.some((i) => i.message.includes('cycle'))).toBe(true);
  });

  it('import is atomic — nothing written on validation failure', () => {
    const target = new InMemoryFlagStore();
    const r = FlagExporter.import(target, {
      format: 'omhw/feature-flags',
      version: 1,
      flags: [{ key: 'ok', type: 'boolean', enabled: true }, { key: '', type: 'boolean', enabled: true }],
      segments: [],
    });
    expect(r.ok).toBe(false);
    expect(target.allFlags()).toHaveLength(0);
  });
});
