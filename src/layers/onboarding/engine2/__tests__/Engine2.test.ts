/**
 * Tests for onboarding engine2: PercentileTracker, ExperimentAnalyzer,
 * RolePersonalizer, ReengagementCampaigns and FunnelAnalytics.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { FlowDefinition } from '../../flow/FlowTypes';
import { PercentileTracker, ReservoirSampler } from '../PercentileTracker';
import {
  assignExperimentVariant,
  compareCompletionRates,
  compareStepFunnels,
  hashToUnitInterval,
  normalCdf,
} from '../ExperimentAnalyzer';
import { RolePersonalizer } from '../RolePersonalizer';
import { ReengagementCampaigns } from '../ReengagementCampaign';
import { FunnelAnalytics, RunSnapshot } from '../OnboardingAnalytics';
import { AbandonmentPredictor, TimedRun } from '../AbandonmentPredictor';
import type { FlowRun } from '../../flow/FlowTypes';

class FakeClock {
  t = 1_700_000_000_000;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

const DAY = 24 * 3600_000;

function linearFlow(): FlowDefinition {
  return {
    flowId: 'onboard',
    version: 1,
    start: 'welcome',
    steps: [
      { id: 'welcome', title: 'Welcome', next: 'profile' },
      { id: 'profile', title: 'Profile', next: 'billing' },
      { id: 'billing', title: 'Billing', next: 'finish' },
      { id: 'finish', title: 'Finish' },
    ],
  };
}

function makeRun(partial: Partial<FlowRun> & Pick<FlowRun, 'runId' | 'userId' | 'flowId'>): FlowRun {
  return {
    variantId: null,
    state: 'in-progress',
    stepOrder: ['welcome', 'profile', 'billing', 'finish'],
    cursor: 1,
    steps: new Map(),
    startedAt: 0,
    lastActiveAt: 0,
    completedAt: null,
    data: {},
    ...partial,
  };
}

describe('ReservoirSampler', () => {
  it('keeps exactly capacity items under heavy load', () => {
    const r = new ReservoirSampler(100);
    for (let i = 0; i < 10_000; i++) r.observe(i);
    expect(r.sample()).toHaveLength(100);
    expect(r.count).toBe(10_000);
  });

  it('is deterministic for a fixed seed', () => {
    const a = new ReservoirSampler(10, 42);
    const b = new ReservoirSampler(10, 42);
    for (let i = 0; i < 500; i++) {
      a.observe(i);
      b.observe(i);
    }
    expect(a.sample()).toEqual(b.sample());
  });
});

describe('PercentileTracker', () => {
  let tracker: PercentileTracker;

  beforeEach(() => {
    tracker = new PercentileTracker();
  });

  it('reports exact percentiles below the sampling threshold', () => {
    for (let i = 1; i <= 100; i++) tracker.observe('step:welcome', i);
    const r = tracker.report('step:welcome')!;
    expect(r.mode).toBe('exact');
    expect(r.count).toBe(100);
    expect(r.p50).toBeCloseTo(50.5, 5);
    expect(r.min).toBe(1);
    expect(r.max).toBe(100);
    expect(r.mean).toBeCloseTo(50.5, 5);
    expect(r.p99).toBeCloseTo(99.01, 1);
  });

  it('switches to estimated mode past the threshold', () => {
    const t = new PercentileTracker({ exactBelow: 50, reservoirCapacity: 200 });
    for (let i = 0; i < 5_000; i++) t.observe('ttc', i % 1000);
    const r = t.report('ttc')!;
    expect(r.mode).toBe('estimated');
    expect(r.count).toBe(5_000);
    // Uniform 0..999: p50 should land near 500 within sampling error.
    expect(r.p50).toBeGreaterThan(350);
    expect(r.p50).toBeLessThan(650);
  });

  it('clamps negative durations to zero', () => {
    tracker.observe('k', -100);
    expect(tracker.report('k')!.min).toBe(0);
  });

  it('returns null for unknown keys and rejects bad p', () => {
    expect(tracker.report('nope')).toBeNull();
    tracker.observe('k', 10);
    expect(() => tracker.quantile('k', 1.5)).toThrow();
  });
});

describe('ExperimentAnalyzer', () => {
  it('detects a clear win', () => {
    const r = compareCompletionRates(
      { variantId: 'A', started: 1000, completed: 400 },
      { variantId: 'B', started: 1000, completed: 500 }
    );
    expect(r.significant).toBe(true);
    expect(r.underpowered).toBe(false);
    expect(r.lift).toBeCloseTo(0.1, 5);
    expect(r.relativeLift).toBeCloseTo(0.25, 5);
    expect(r.pValue).toBeLessThan(0.001);
  });

  it('flags underpowered experiments instead of false positives', () => {
    const r = compareCompletionRates(
      { variantId: 'A', started: 10, completed: 0 },
      { variantId: 'B', started: 10, completed: 3 }
    );
    expect(r.underpowered).toBe(true);
    expect(r.significant).toBe(false);
  });

  it('reports no difference when rates match', () => {
    const r = compareCompletionRates(
      { variantId: 'A', started: 500, completed: 250 },
      { variantId: 'B', started: 500, completed: 250 }
    );
    expect(r.zScore).toBeCloseTo(0, 5);
    expect(r.significant).toBe(false);
  });

  it('throws on empty arms', () => {
    expect(() =>
      compareCompletionRates(
        { variantId: 'A', started: 0, completed: 0 },
        { variantId: 'B', started: 10, completed: 5 }
      )
    ).toThrow();
  });

  it('normalCdf sanity: cdf(0)=0.5, cdf(1.96)≈0.975', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1.95996)).toBeCloseTo(0.975, 3);
  });

  it('assignment is deterministic and respects weights', () => {
    const variants = [
      { variantId: 'A', weight: 0.5 },
      { variantId: 'B', weight: 0.5 },
    ];
    const first = assignExperimentVariant('user-7', variants, 'exp-1');
    expect(assignExperimentVariant('user-7', variants, 'exp-1')).toBe(first);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 2000; i++) {
      const v = assignExperimentVariant(`u-${i}`, variants, 'exp-1');
      if (v === 'A') a++;
      else if (v === 'B') b++;
    }
    expect(a).toBeGreaterThan(800);
    expect(b).toBeGreaterThan(800);
  });

  it('returns null for the holdout remainder', () => {
    const variants = [{ variantId: 'A', weight: 0.1 }];
    const hits = new Set<string | null>();
    for (let i = 0; i < 500; i++) hits.add(assignExperimentVariant(`u-${i}`, variants, 'e'));
    expect(hits.has(null)).toBe(true);
    expect(hits.has('A')).toBe(true);
  });

  it('rejects weights summing over 1', () => {
    expect(() =>
      assignExperimentVariant('u', [{ variantId: 'A', weight: 0.8 }, { variantId: 'B', weight: 0.8 }], 'e')
    ).toThrow();
  });

  it('hashToUnitInterval stays in [0,1)', () => {
    for (const u of ['a', 'bb', 'ccc', 'user-42']) {
      const v = hashToUnitInterval(u, 's');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('compareStepFunnels sorts worst regression first', () => {
    const out = compareStepFunnels(
      { s1: { entered: 100, completed: 90 }, s2: { entered: 100, completed: 80 } },
      { s1: { entered: 100, completed: 60 }, s2: { entered: 100, completed: 82 } }
    );
    expect(out[0].stepId).toBe('s1');
    expect(out[0].lift).toBeCloseTo(-0.3, 5);
    expect(out[1].lift).toBeCloseTo(0.02, 5);
  });
});

describe('RolePersonalizer', () => {
  let p: RolePersonalizer;

  beforeEach(() => {
    p = new RolePersonalizer();
    p.register({ role: 'free', exclude: ['billing'] });
    p.register({ role: 'viewer', include: ['welcome', 'finish'] });
  });

  it('excludes steps and re-links linear edges', () => {
    const { flow, removed } = p.personalize(linearFlow(), 'free');
    expect(removed).toEqual(['billing']);
    const ids = flow.steps.map((s) => s.id);
    expect(ids).toEqual(['welcome', 'profile', 'finish']);
    const profile = flow.steps.find((s) => s.id === 'profile')!;
    expect(profile.next).toBe('finish'); // skips removed 'billing'
  });

  it('include-mode keeps only listed steps and fixes start', () => {
    const { flow } = p.apply(linearFlow(), { role: 'x', include: ['profile', 'finish'] });
    expect(flow.steps.map((s) => s.id)).toEqual(['profile', 'finish']);
    expect(flow.start).toBe('profile');
    expect(flow.steps[1].next).toBeUndefined();
  });

  it('reports unknown steps referenced by the profile', () => {
    const { unknownSteps } = p.apply(linearFlow(), {
      role: 'x',
      exclude: ['billing', 'ghost-step'],
    });
    expect(unknownSteps).toEqual(['ghost-step']);
  });

  it('re-links branch targets over removed steps', () => {
    const flow: FlowDefinition = {
      flowId: 'f',
      version: 1,
      start: 'a',
      steps: [
        {
          id: 'a',
          title: 'A',
          next: [
            { when: () => true, to: 'b' },
            { when: () => false, to: 'c' },
          ],
        },
        { id: 'b', title: 'B', next: 'd' },
        { id: 'c', title: 'C', next: 'd' },
        { id: 'd', title: 'D' },
      ],
    };
    const { flow: out } = p.apply(flow, { role: 'r', exclude: ['b', 'c'] });
    const a = out.steps.find((s) => s.id === 'a')!;
    // Both branch targets died → falls back to positional successor 'd'.
    expect(a.next).toBe('d');
  });

  it('trims variant step orders to surviving steps', () => {
    const flow: FlowDefinition = {
      ...linearFlow(),
      variants: [{ variantId: 'v1', weight: 0.5, stepOrder: ['billing', 'welcome', 'finish'] }],
    };
    const { flow: out } = p.apply(flow, { role: 'r', exclude: ['billing'] });
    expect(out.variants![0].stepOrder).toEqual(['welcome', 'finish']);
  });

  it('rejects include+exclude and unknown roles', () => {
    expect(() => p.register({ role: 'bad', include: ['a'], exclude: ['b'] })).toThrow();
    expect(() => p.personalize(linearFlow(), 'nobody')).toThrow();
  });

  it('merges context defaults under user data', () => {
    const ctx = p.applyContextDefaults(
      { role: 'r', contextDefaults: { theme: 'dark', lang: 'en' } },
      { theme: 'light' }
    );
    expect(ctx).toEqual({ theme: 'light', lang: 'en' });
  });
});

describe('ReengagementCampaigns', () => {
  let clock: FakeClock;
  let rc: ReengagementCampaigns;

  beforeEach(() => {
    clock = new FakeClock();
    rc = new ReengagementCampaigns({ clock });
    rc.register({
      campaignId: 'winback-billing',
      flowId: 'onboard',
      targetStep: 'billing',
      cadenceMs: [DAY, 7 * DAY],
      template: 'Hi {userId}, finish {stepId} in {flowId}!',
    });
  });

  it('emits a touch when a run is stuck at the target step past cadence', () => {
    const run = makeRun({
      runId: 'r1',
      userId: 'u1',
      flowId: 'onboard',
      lastActiveAt: clock.now() - 2 * DAY,
    });
    run.stepOrder = ['welcome', 'profile', 'billing', 'finish'];
    run.cursor = 2;
    const touches = rc.evaluate([run]);
    expect(touches).toHaveLength(1);
    expect(touches[0].touchIndex).toBe(0);
    expect(touches[0].message).toBe('Hi u1, finish billing in onboard!');
  });

  it('skips to the highest due cadence step', () => {
    const run = makeRun({
      runId: 'r2',
      userId: 'u2',
      flowId: 'onboard',
      lastActiveAt: clock.now() - 10 * DAY,
    });
    run.cursor = 2;
    const touches = rc.evaluate([run]);
    expect(touches).toHaveLength(1);
    expect(touches[0].touchIndex).toBe(1); // jumped to the 7d touch
  });

  it('never re-fires a sent touch (dedup)', () => {
    const run = makeRun({
      runId: 'r3',
      userId: 'u3',
      flowId: 'onboard',
      lastActiveAt: clock.now() - 2 * DAY,
    });
    run.cursor = 2;
    rc.evaluate([run]);
    clock.advance(3600_000);
    const again = rc.evaluate([run]);
    expect(again).toHaveLength(0);
    expect(rc.touches()).toHaveLength(1);
  });

  it('ignores completed/abandoned runs and suppressed users', () => {
    const done = makeRun({
      runId: 'r4',
      userId: 'u4',
      flowId: 'onboard',
      state: 'completed',
      lastActiveAt: 0,
    });
    const suppressed = makeRun({
      runId: 'r5',
      userId: 'u5',
      flowId: 'onboard',
      lastActiveAt: 0,
    });
    suppressed.cursor = 2;
    rc.suppress('u5', clock.now() + DAY);
    expect(rc.evaluate([done, suppressed])).toHaveLength(0);
  });

  it("targetStep 'any' matches whatever step is current", () => {
    rc.register({
      campaignId: 'generic',
      flowId: 'onboard',
      targetStep: 'any',
      cadenceMs: [DAY],
      template: 'come back',
    });
    const run = makeRun({
      runId: 'r6',
      userId: 'u6',
      flowId: 'onboard',
      lastActiveAt: clock.now() - 2 * DAY,
    });
    run.cursor = 0;
    const touches = rc.evaluate([run]);
    const generic = touches.filter((t) => t.campaignId === 'generic');
    expect(generic).toHaveLength(1);
    expect(generic[0].stepId).toBe('welcome');
  });

  it('tracks win-back stats via attribute()', () => {
    const run = makeRun({
      runId: 'r7',
      userId: 'u7',
      flowId: 'onboard',
      lastActiveAt: clock.now() - 2 * DAY,
    });
    run.cursor = 2;
    rc.evaluate([run]);
    rc.attribute('winback-billing', 'u7');
    rc.attribute('winback-billing', 'u7'); // idempotent
    const s = rc.stats('winback-billing');
    expect(s.touchesSent).toBe(1);
    expect(s.usersTouched).toBe(1);
    expect(s.usersReturned).toBe(1);
    expect(s.winBackRate).toBe(1);
  });

  it('rejects empty or non-increasing cadences', () => {
    expect(() =>
      rc.register({ campaignId: 'x', flowId: 'f', targetStep: 'any', cadenceMs: [], template: 't' })
    ).toThrow();
    expect(() =>
      rc.register({ campaignId: 'y', flowId: 'f', targetStep: 'any', cadenceMs: [5, 5], template: 't' })
    ).toThrow();
  });
});

describe('FunnelAnalytics', () => {
  const analytics = new FunnelAnalytics();

  function snapshot(
    runId: string,
    visited: string[],
    opts?: { currentStep?: string | null; completed?: boolean; cohort?: string }
  ): RunSnapshot {
    return {
      runId,
      flowId: 'onboard',
      visited,
      currentStep: opts?.currentStep ?? null,
      completed: opts?.completed ?? false,
      cohort: opts?.cohort,
    };
  }

  it('computes per-step transition rates in declared order', () => {
    const runs = [
      snapshot('r1', ['welcome', 'profile', 'billing', 'finish'], { completed: true }),
      snapshot('r2', ['welcome', 'profile'], { currentStep: 'profile' }),
      snapshot('r3', ['welcome']),
      snapshot('r4', ['welcome', 'profile', 'billing'], { currentStep: 'billing' }),
    ];
    const report = analytics.build(linearFlow(), runs);
    expect(report.totalRuns).toBe(4);
    expect(report.overallConversion).toBeCloseTo(0.25, 5);
    const welcome = report.steps[0];
    expect(welcome.entered).toBe(4);
    expect(welcome.advanced).toBe(3);
    expect(welcome.transitionRate).toBeCloseTo(0.75, 5);
    expect(report.biggestDrop).toBe('finish'); // only 1 of 3 advanced through billing... verify
  });

  it('identifies the biggest drop step', () => {
    const runs = [
      snapshot('r1', ['welcome', 'profile'], { completed: false }),
      snapshot('r2', ['welcome']),
      snapshot('r3', ['welcome']),
      snapshot('r4', ['welcome']),
    ];
    const report = analytics.build(linearFlow(), runs);
    // profile: 1 entered, 0 advanced → 0% beats welcome's 1/4 → 25%.
    expect(report.biggestDrop).toBe('profile');
  });

  it('handles variant orders by canonical position', () => {
    // Variant visits billing BEFORE profile — canonical order still applies.
    const runs = [
      snapshot('r1', ['welcome', 'billing', 'profile', 'finish'], { completed: true }),
    ];
    const report = analytics.build(linearFlow(), runs);
    expect(report.overallConversion).toBe(1);
    expect(report.steps.every((s) => s.entered === 1)).toBe(true);
  });

  it('splits funnels by cohort', () => {
    const runs = [
      snapshot('m1', ['welcome', 'profile', 'billing', 'finish'], { completed: true, cohort: 'mobile' }),
      snapshot('w1', ['welcome'], { cohort: 'web' }),
      snapshot('w2', ['welcome'], { cohort: 'web' }),
    ];
    const byCohort = analytics.byCohort(linearFlow(), runs);
    expect(byCohort.get('mobile')!.overallConversion).toBe(1);
    expect(byCohort.get('web')!.overallConversion).toBe(0);
  });
});

describe('AbandonmentPredictor', () => {
  let predictor: AbandonmentPredictor;

  function timed(
    runId: string,
    visited: string[],
    dwellMs: number[],
    opts?: { currentStep?: string | null; completed?: boolean; skippedCount?: number; idleMs?: number }
  ): TimedRun {
    return {
      runId,
      flowId: 'onboard',
      visited,
      dwellMs,
      currentStep: opts?.currentStep ?? null,
      completed: opts?.completed ?? false,
      skippedCount: opts?.skippedCount,
      idleMs: opts?.idleMs,
    };
  }

  beforeEach(() => {
    predictor = new AbandonmentPredictor();
    // Train: billing is the killer (median dwell 60s, many abandon there).
    const hist: TimedRun[] = [];
    for (let i = 0; i < 40; i++) {
      hist.push(timed(`ok-${i}`, ['welcome', 'profile', 'billing', 'finish'], [5000, 10_000, 60_000, 3000], { completed: true }));
    }
    for (let i = 0; i < 30; i++) {
      hist.push(timed(`dead-${i}`, ['welcome', 'profile', 'billing'], [5000, 10_000, 400_000]));
    }
    predictor.train(linearFlow(), hist);
  });

  it('scores a slow dwell on a risky step as high risk', () => {
    const r = timed('live', ['welcome', 'profile', 'billing'], [5000, 10_000, 600_000], {
      currentStep: 'billing',
      skippedCount: 2,
      idleMs: 4 * 24 * 3600_000,
    });
    const s = predictor.score(r);
    expect(s.bucket).toBe('high');
    expect(s.signals.stepRisk).toBeCloseTo(30 / 70, 2); // 30 abandoned of 70 exits+abandons
    expect(s.score).toBeGreaterThan(0.66);
  });

  it('scores a fast clean run as low risk', () => {
    const r = timed('live', ['welcome'], [4000], { currentStep: 'welcome', idleMs: 1000 });
    const s = predictor.score(r);
    expect(s.bucket).toBe('low');
  });

  it('completed runs score 0; dead runs score 1', () => {
    expect(predictor.score(timed('c', ['welcome'], [1], { completed: true })).score).toBe(0);
    expect(predictor.score(timed('d', ['welcome'], [1])).score).toBe(1);
  });

  it('rank orders by descending risk', () => {
    const risky = timed('risky', ['welcome', 'profile', 'billing'], [1, 1, 500_000], {
      currentStep: 'billing',
      skippedCount: 2,
      idleMs: 48 * 3600_000,
    });
    const safe = timed('safe', ['welcome'], [1000], { currentStep: 'welcome' });
    const ranked = predictor.rank([safe, risky]);
    expect(ranked[0].runId).toBe('risky');
    expect(ranked[1].runId).toBe('safe');
  });

  it('untrained predictor throws', () => {
    const fresh = new AbandonmentPredictor();
    expect(() => fresh.score(timed('x', ['welcome'], [1], { currentStep: 'welcome' }))).toThrow('not trained');
  });
});
