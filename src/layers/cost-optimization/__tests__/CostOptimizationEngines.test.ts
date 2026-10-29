import { describe, it, expect, beforeEach } from 'bun:test';
import { CostInventoryEngine } from '../engines/CostInventoryEngine';
import { IdleDetectionEngine } from '../engines/IdleDetectionEngine';
import { RightsizingEngine } from '../engines/RightsizingEngine';
import { CommitmentCoverageEngine } from '../engines/CommitmentCoverageEngine';
import { BudgetEngine } from '../engines/BudgetEngine';
import { AnomalyDetectionEngine } from '../engines/AnomalyDetectionEngine';
import { SavingsPlanUtilizationEngine } from '../engines/SavingsPlanUtilizationEngine';
import { TestClock, DAY_MS, HOUR_MS } from '../engines/types';

describe('CostInventoryEngine', () => {
  let engine: CostInventoryEngine;

  beforeEach(() => {
    engine = new CostInventoryEngine(new TestClock());
    engine.addAttributionRule({
      tagKey: 'team',
      mapping: { platform: 'cc-platform', payments: 'cc-payments', '*': 'cc-other' },
      fallback: null,
    });
    engine.addAttributionRule({ tagKey: 'cost-center', mapping: { '*': 'cc-explicit' }, fallback: null });
  });

  function add(id: string, cents: number, tags: Record<string, string>) {
    engine.upsertResource({ id, kind: 'compute', size: 'm5.large', hourlyCostCents: cents, tags, active: true });
  }

  it('attributes resources to cost centers via rules', () => {
    add('r1', 100, { team: 'platform' });
    add('r2', 200, { team: 'payments' });
    add('r3', 50, { team: 'unknown-team' });
    expect(engine.attribute('r1')).toBe('cc-platform');
    expect(engine.attribute('r2')).toBe('cc-payments');
    expect(engine.attribute('r3')).toBe('cc-other'); // '*' catch-all
  });

  it('falls through to unattributed when no rule matches', () => {
    add('r1', 100, {});
    expect(engine.attribute('r1')).toBe('unattributed');
    expect(engine.unattributedResources().map((r) => r.id)).toEqual(['r1']);
  });

  it('produces a spend-sorted breakdown', () => {
    add('r1', 100, { team: 'platform' });
    add('r2', 300, { team: 'payments' });
    add('r3', 50, { team: 'platform' });
    const bd = engine.breakdown();
    expect(bd[0]!.costCenter).toBe('cc-payments');
    expect(bd[0]!.hourlyCostCents).toBe(300);
    expect(bd[1]!.hourlyCostCents).toBe(150);
  });

  it('excludes inactive resources from totals', () => {
    add('r1', 100, { team: 'platform' });
    engine.upsertResource({ id: 'r2', kind: 'compute', size: 'x', hourlyCostCents: 999, tags: {}, active: false });
    expect(engine.totalHourlyCostCents()).toBe(100);
  });

  it('computes attribution coverage', () => {
    add('r1', 75, { team: 'platform' });
    add('r2', 25, {});
    expect(engine.attributionCoveragePct()).toBe(75);
  });
});

describe('IdleDetectionEngine', () => {
  let clock: TestClock;
  let inventory: CostInventoryEngine;
  let engine: IdleDetectionEngine;

  beforeEach(() => {
    clock = new TestClock(10 * DAY_MS);
    inventory = new CostInventoryEngine(clock);
    inventory.upsertResource({
      id: 'zombie',
      kind: 'compute',
      size: 'm5.xlarge',
      hourlyCostCents: 140,
      tags: {},
      active: true,
    });
    engine = new IdleDetectionEngine(
      { windowMs: 7 * DAY_MS, percentile: 95, idleThresholdPercent: 5, minSamples: 5 },
      inventory,
      clock
    );
  });

  function feed(resourceId: string, percents: number[], baseTs: number) {
    percents.forEach((p, i) => {
      engine.record({ resourceId, metric: 'cpu', timestamp: baseTs + i * HOUR_MS, percent: p });
    });
  }

  it('flags a resource whose p95 is below threshold as idle', () => {
    feed('zombie', [1, 2, 1, 3, 2, 1, 4, 2, 1, 2], clock.now() - 2 * DAY_MS);
    const report = engine.evaluate('zombie', 'cpu');
    expect(report).not.toBeNull();
    expect(report!.idle).toBe(true);
    expect(report!.hourlyWasteCents).toBe(140);
  });

  it('does not flag an active resource', () => {
    feed('busy', [40, 55, 60, 45, 70, 50, 65, 42, 58, 61], clock.now() - 2 * DAY_MS);
    const report = engine.evaluate('busy', 'cpu');
    expect(report!.idle).toBe(false);
  });

  it('ignores samples outside the window', () => {
    // Old samples are busy — recent samples are idle.
    feed('flappy', [90, 95, 88, 92, 91], clock.now() - 30 * DAY_MS);
    feed('flappy', [1, 1, 2, 1, 1, 2], clock.now() - DAY_MS);
    const report = engine.evaluate('flappy', 'cpu');
    expect(report!.idle).toBe(true);
    expect(report!.sampleCount).toBe(6);
  });

  it('returns null when below minSamples', () => {
    feed('sparse', [1, 2], clock.now() - DAY_MS);
    expect(engine.evaluate('sparse', 'cpu')).toBeNull();
  });

  it('computes nearest-rank percentile correctly', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(IdleDetectionEngine.percentile(sorted, 50)).toBe(5);
    expect(IdleDetectionEngine.percentile(sorted, 95)).toBe(10);
    expect(IdleDetectionEngine.percentile(sorted, 100)).toBe(10);
  });

  it('handles out-of-order samples', () => {
    engine.record({ resourceId: 'x', metric: 'cpu', timestamp: 500, percent: 1 });
    engine.record({ resourceId: 'x', metric: 'cpu', timestamp: 100, percent: 2 });
    engine.record({ resourceId: 'x', metric: 'cpu', timestamp: 300, percent: 3 });
    const arr = (engine as unknown as { _samples: Map<string, { timestamp: number }[]> })._samples.get('x::cpu')!;
    expect(arr.map((s) => s.timestamp)).toEqual([100, 300, 500]);
  });
});

describe('RightsizingEngine', () => {
  let engine: RightsizingEngine;

  beforeEach(() => {
    engine = new RightsizingEngine({ targetUtilization: 70 });
    engine.addSize({ size: 'small', capacityUnits: 2, hourlyCostCents: 20 });
    engine.addSize({ size: 'medium', capacityUnits: 4, hourlyCostCents: 40 });
    engine.addSize({ size: 'large', capacityUnits: 8, hourlyCostCents: 80 });
    engine.addSize({ size: 'xlarge', capacityUnits: 16, hourlyCostCents: 160 });
  });

  it('recommends downsizing when projected utilization is safe', () => {
    // p95 20% on xlarge (16 units) → projected on medium (4 units) = 80% (too high)
    // on large (8 units) = 40% → safe. Greedy picks cheapest safe size.
    const rec = engine.recommend('r1', 'xlarge', 20);
    expect(rec).not.toBeNull();
    // small: 20*16/2=160% no. medium: 20*16/4=80% no. large: 40% yes.
    expect(rec!.recommendedSize).toBe('large');
    expect(rec!.hourlySavingsCents).toBe(80);
  });

  it('recommends the smallest safe size (cheapest first)', () => {
    // p95 10% on xlarge → small: 80% too high. medium: 40% safe.
    const rec = engine.recommend('r1', 'xlarge', 10);
    expect(rec!.recommendedSize).toBe('medium');
    expect(rec!.hourlySavingsCents).toBe(120);
  });

  it('returns null when already right-sized', () => {
    const rec = engine.recommend('r1', 'large', 60);
    expect(rec).toBeNull();
  });

  it('returns null for unknown current size', () => {
    expect(engine.recommend('r1', 'nonexistent', 10)).toBeNull();
  });

  it('batch sorts by savings descending', () => {
    const recs = engine.recommendAll([
      { resourceId: 'a', currentSize: 'xlarge', observedP95: 10 },
      { resourceId: 'b', currentSize: 'medium', observedP95: 20 },
      { resourceId: 'c', currentSize: 'large', observedP95: 65 },
    ]);
    expect(recs.length).toBe(2);
    expect(recs[0]!.resourceId).toBe('a'); // bigger saving
    expect(engine.totalSavingsCents(recs)).toBe(120 + 20);
  });
});

describe('CommitmentCoverageEngine', () => {
  let inventory: CostInventoryEngine;
  let engine: CommitmentCoverageEngine;

  beforeEach(() => {
    inventory = new CostInventoryEngine(new TestClock());
    engine = new CommitmentCoverageEngine(inventory);
    // 4x large on-demand at 80c/hr
    for (let i = 0; i < 4; i++) {
      inventory.upsertResource({
        id: `r${i}`,
        kind: 'compute',
        size: 'large',
        hourlyCostCents: 80,
        tags: {},
        active: true,
      });
    }
  });

  it('computes coverage and savings with partial commitment', () => {
    engine.addCommitment({
      id: 'ri-1',
      type: 'reserved',
      coveredSizes: ['large'],
      unitsPerHour: 2,
      unitHourlyCostCents: 50,
    });
    const a = engine.analyze();
    expect(a.totalDemandUnits).toBe(4);
    expect(a.coveredUnits).toBe(2);
    expect(a.coveragePct).toBe(50);
    // 2×50 + 2×80 = 260 vs 4×80 = 320 → save 60
    expect(a.effectiveHourlyCents).toBe(260);
    expect(a.savingsCents).toBe(60);
  });

  it('allocates cheapest commitments first', () => {
    engine.addCommitment({ id: 'exp', type: 'reserved', coveredSizes: ['large'], unitsPerHour: 2, unitHourlyCostCents: 70 });
    engine.addCommitment({ id: 'cheap', type: 'savings-plan', coveredSizes: ['large'], unitsPerHour: 2, unitHourlyCostCents: 40 });
    const a = engine.analyze();
    // cheap covers 2 @40, exp covers 2 @70 → 80+140=220 vs 320
    expect(a.effectiveHourlyCents).toBe(220);
    expect(a.coveragePct).toBe(100);
  });

  it('reports under-utilized commitments', () => {
    engine.addCommitment({ id: 'ri-big', type: 'reserved', coveredSizes: ['large'], unitsPerHour: 10, unitHourlyCostCents: 50 });
    const u = engine.utilizationOf('ri-big');
    expect(u.used).toBe(4);
    expect(u.total).toBe(10);
    expect(u.utilizationPct).toBe(40);
  });

  it('handles commitments covering multiple sizes', () => {
    inventory.upsertResource({ id: 'm1', kind: 'compute', size: 'medium', hourlyCostCents: 40, tags: {}, active: true });
    engine.addCommitment({ id: 'sp', type: 'savings-plan', coveredSizes: ['large', 'medium'], unitsPerHour: 5, unitHourlyCostCents: 30 });
    const a = engine.analyze();
    expect(a.coveredUnits).toBe(5); // 4 large + 1 medium all covered
  });
});

describe('BudgetEngine', () => {
  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(0);
  });

  function monthlyBudget(engine: BudgetEngine, limit: number, start = 0) {
    engine.addBudget({
      id: 'b1',
      name: 'platform monthly',
      costCenter: 'cc-platform',
      periodMs: 30 * DAY_MS,
      limitCents: limit,
      periodStart: start,
    });
  }

  it('linear forecast extrapolates run-rate', () => {
    const engine = new BudgetEngine({ method: 'linear' }, clock);
    monthlyBudget(engine, 1000);
    // Day 10 of 30: spent 500 → forecast 1500 → breach
    clock.set(10 * DAY_MS);
    engine.recordSpend({ costCenter: 'cc-platform', timestamp: 5 * DAY_MS, amountCents: 500 });
    const s = engine.status('b1');
    expect(s.spentCents).toBe(500);
    expect(s.forecastCents).toBeCloseTo(1500);
    expect(s.forecastBreach).toBe(true);
  });

  it('moving-average forecast projects remaining days at trailing rate', () => {
    const engine = new BudgetEngine({ method: 'moving-average', movingAverageDays: 7 }, clock);
    monthlyBudget(engine, 10000);
    clock.set(10 * DAY_MS);
    // 70/day over the last 7 days → spent 700; forecast 700 + 70*20 = 2100
    for (let d = 3; d < 10; d++) {
      engine.recordSpend({ costCenter: 'cc-platform', timestamp: d * DAY_MS, amountCents: 100 });
    }
    const s = engine.status('b1');
    expect(s.spentCents).toBe(700);
    expect(s.forecastCents).toBeCloseTo(700 + 100 * 20, 0);
    expect(s.forecastBreach).toBe(false);
  });

  it('excludes spend outside the current period', () => {
    const engine = new BudgetEngine({ method: 'linear' }, clock);
    monthlyBudget(engine, 1000, 30 * DAY_MS);
    clock.set(35 * DAY_MS);
    engine.recordSpend({ costCenter: 'cc-platform', timestamp: 5 * DAY_MS, amountCents: 99999 }); // prior period
    engine.recordSpend({ costCenter: 'cc-platform', timestamp: 32 * DAY_MS, amountCents: 100 });
    expect(engine.status('b1').spentCents).toBe(100);
  });

  it('rolls periods forward', () => {
    const engine = new BudgetEngine({ method: 'linear' }, clock);
    monthlyBudget(engine, 1000, 0);
    clock.set(65 * DAY_MS); // 2 full periods + 5 days
    const rolled = engine.rollPeriods();
    expect(rolled).toBe(2);
    const s = engine.status('b1');
    expect(s.spentCents).toBe(0);
  });
});

describe('AnomalyDetectionEngine', () => {
  let clock: TestClock;
  let engine: AnomalyDetectionEngine;

  beforeEach(() => {
    clock = new TestClock(60 * DAY_MS);
    engine = new AnomalyDetectionEngine({ windowMs: 30 * DAY_MS, zThreshold: 2.0, minSamples: 5 }, clock);
  });

  function feedBaseline(cc: string, values: number[], startTs: number) {
    values.forEach((v, i) => {
      engine.ingest({ costCenter: cc, timestamp: startTs + i * DAY_MS, amountCents: v });
    });
  }

  it('detects a spend spike', () => {
    feedBaseline('cc-1', [100, 102, 98, 101, 99, 100, 101], clock.now() - 10 * DAY_MS);
    const a = engine.ingest({ costCenter: 'cc-1', timestamp: clock.now(), amountCents: 300 });
    expect(a).not.toBeNull();
    expect(a!.direction).toBe('spike');
    expect(a!.zScore).toBeGreaterThan(2);
  });

  it('detects a spend drop', () => {
    feedBaseline('cc-1', [100, 102, 98, 101, 99, 100, 101], clock.now() - 10 * DAY_MS);
    const a = engine.ingest({ costCenter: 'cc-1', timestamp: clock.now(), amountCents: 10 });
    expect(a!.direction).toBe('drop');
  });

  it('does not flag normal variance', () => {
    feedBaseline('cc-1', [100, 110, 90, 105, 95, 100, 105], clock.now() - 10 * DAY_MS);
    const a = engine.ingest({ costCenter: 'cc-1', timestamp: clock.now(), amountCents: 108 });
    expect(a).toBeNull();
  });

  it('requires minimum baseline samples', () => {
    feedBaseline('cc-1', [100, 100], clock.now() - 5 * DAY_MS);
    const a = engine.ingest({ costCenter: 'cc-1', timestamp: clock.now(), amountCents: 5000 });
    expect(a).toBeNull(); // only 2 samples < minSamples 5
  });

  it('keeps cost centers independent', () => {
    feedBaseline('cc-1', [100, 100, 100, 100, 100], clock.now() - 10 * DAY_MS);
    feedBaseline('cc-2', [10, 10, 10, 10, 10], clock.now() - 10 * DAY_MS);
    const a = engine.ingest({ costCenter: 'cc-2', timestamp: clock.now(), amountCents: 100 });
    expect(a!.direction).toBe('spike'); // anomalous for cc-2, normal for cc-1
  });

  it('handles zero-variance baseline', () => {
    feedBaseline('cc-1', [50, 50, 50, 50, 50], clock.now() - 10 * DAY_MS);
    expect(engine.ingest({ costCenter: 'cc-1', timestamp: clock.now(), amountCents: 50 })).toBeNull();
    const a = engine.ingest({ costCenter: 'cc-1', timestamp: clock.now(), amountCents: 60 });
    expect(a).not.toBeNull();
  });
});

describe('SavingsPlanUtilizationEngine', () => {
  let clock: TestClock;
  let engine: SavingsPlanUtilizationEngine;

  beforeEach(() => {
    clock = new TestClock(48 * HOUR_MS);
    engine = new SavingsPlanUtilizationEngine(clock);
    engine.registerPlan('sp-1', 100); // 100c/hr commitment
  });

  it('reports 100% when usage matches commitment', () => {
    // 100c of eligible spend in each of the last 2 hour-slots
    engine.recordUsage('sp-1', clock.now() - HOUR_MS - 1000, 100);
    engine.recordUsage('sp-1', clock.now() - 60000, 100);
    const r = engine.report('sp-1', 2 * HOUR_MS);
    expect(r.utilizationPct).toBeGreaterThan(99);
    expect(r.wastedCents).toBeLessThan(2);
  });

  it('reports waste when usage is below commitment', () => {
    engine.recordUsage('sp-1', clock.now() - 30 * 60 * 1000, 50); // 50c in current partial hour
    const r = engine.report('sp-1', HOUR_MS);
    expect(r.utilizationPct).toBeLessThan(60);
    expect(r.wastedCents).toBeGreaterThan(30);
  });

  it('caps consumption at commitment — overage is on-demand not waste-negative', () => {
    engine.recordUsage('sp-1', clock.now() - 30 * 60 * 1000, 500); // 5× commitment in one hour
    const r = engine.report('sp-1', HOUR_MS);
    expect(r.utilizationPct).toBeLessThanOrEqual(100);
    expect(r.wastedCents).toBeLessThan(5);
  });

  it('ranks worst-utilized plans', () => {
    engine.registerPlan('sp-2', 200);
    engine.recordUsage('sp-2', clock.now() - 30 * 60 * 1000, 10); // barely used
    const worst = engine.worstUtilized(HOUR_MS);
    expect(worst[0]!.planId).toBe('sp-2');
  });
});
