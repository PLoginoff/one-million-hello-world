/**
 * Cost Optimization Engine2 — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { DAY_MS, TestClock } from '../engines/types';
import {
  CostForecaster,
  DailySpend,
  InsufficientHistoryError,
  weekdayOf,
} from '../engine2/CostForecaster';
import {
  RecommendationKind,
  RecommendationTier,
  SavingsRanker,
  SavingsRecommendation,
} from '../engine2/SavingsRanker';
import { UnitDimension, UnitEconomics } from '../engine2/UnitEconomics';
import { AnomalyRootCause, TaggedSpendRecord } from '../engine2/AnomalyRootCause';

const DAY0 = 1_700_000_000_000; // fixed epoch for deterministic weekdays

function series(n: number, fn: (dayIndex: number, weekday: number) => number): DailySpend[] {
  const out: DailySpend[] = [];
  for (let i = 0; i < n; i++) {
    const day = DAY0 + i * DAY_MS;
    out.push({ day, amountCents: fn(i, weekdayOf(day)) });
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/* CostForecaster                                                          */
/* ----------------------------------------------------------------------- */

describe('CostForecaster', () => {
  it('fits a flat series with ~zero slope', () => {
    const f = new CostForecaster({ minSamples: 7 });
    const m = f.fit(series(21, () => 10000));
    expect(Math.abs(m.slopeCentsPerDay)).toBeLessThan(1e-6);
    expect(m.meanCents).toBe(10000);
    expect(m.sampleCount).toBe(21);
  });

  it('fits a rising trend and extrapolates correctly', () => {
    const f = new CostForecaster({ minSamples: 7 });
    const hist = series(30, (i) => 5000 + i * 100); // +100c/day
    const m = f.fit(hist);
    expect(m.slopeCentsPerDay).toBeCloseTo(100, 3);
    const lastDay = hist[29].day;
    const p = f.predict(hist, lastDay + DAY_MS);
    // next day expected: 5000 + 30*100 × seasonal(≈1)
    expect(p.predictedCents).toBeGreaterThan(7500);
    expect(p.predictedCents).toBeLessThan(8500);
    // Interval is degenerate (perfect fit → 0 residual stderr) but sane.
    expect(p.lowerCents).toBeLessThanOrEqual(p.predictedCents);
  });

  it('captures weekly seasonality — weekend vs weekday', () => {
    const f = new CostForecaster({ minSamples: 14, minDaysForSeasonality: 14 });
    // Weekdays 10000, weekends 2000.
    const hist = series(35, (_i, wd) => (wd >= 5 ? 2000 : 10000));
    const m = f.fit(hist);
    expect(m.seasonalIndex[0]).toBeGreaterThan(1); // Monday above average
    expect(m.seasonalIndex[5]).toBeLessThan(1); // Saturday below
    expect(m.seasonalIndex[6]).toBeLessThan(1); // Sunday below
    // Weekend forecast should land near 2000, weekday near 10000.
    const saturday = hist.findIndex((d) => weekdayOf(d.day) === 5);
    const sat = hist[saturday].day;
    const nextSat = sat + 7 * DAY_MS;
    const p = f.predict(hist, nextSat);
    expect(p.predictedCents).toBeGreaterThan(1000);
    expect(p.predictedCents).toBeLessThan(4000);
  });

  it('prediction interval widens with distance from the data', () => {
    const f = new CostForecaster({ minSamples: 7 });
    // Alternating residual noise so stdErr > 0 (constant series gives a
    // degenerate zero-width interval).
    const hist = series(30, (i) => 10000 + (i % 2 === 0 ? 500 : -500));
    const near = f.predict(hist, hist[29].day + DAY_MS);
    const far = f.predict(hist, hist[29].day + 90 * DAY_MS);
    expect(near.intervalWidth).toBeGreaterThan(0);
    expect(far.intervalWidth).toBeGreaterThan(near.intervalWidth);
  });

  it('throws below minSamples', () => {
    const f = new CostForecaster({ minSamples: 14 });
    expect(() => f.fit(series(5, () => 100))).toThrow(InsufficientHistoryError);
  });

  it('projectTotal sums daily forecasts', () => {
    const f = new CostForecaster({ minSamples: 7 });
    const hist = series(21, () => 5000);
    const t = f.projectTotal(hist, hist[20].day + DAY_MS, 7);
    expect(t.daily.length).toBe(7);
    expect(t.totalCents).toBeCloseTo(5000 * 7, 0);
  });

  it('weekdayOf returns ISO weekdays', () => {
    // 1970-01-01 was a Thursday (index 3 when Mon=0).
    expect(weekdayOf(0)).toBe(3);
    expect(weekdayOf(4 * DAY_MS)).toBe(0); // 1970-01-05 Monday
    expect(weekdayOf(5 * DAY_MS)).toBe(1);
  });
});

/* ----------------------------------------------------------------------- */
/* SavingsRanker                                                           */
/* ----------------------------------------------------------------------- */

describe('SavingsRanker', () => {
  const now = 1_700_100_000_000;
  function clock(): TestClock {
    return new TestClock(now);
  }
  function rec(overrides: Partial<SavingsRecommendation> = {}): SavingsRecommendation {
    return {
      id: 'r1',
      kind: RecommendationKind.TERMINATE_IDLE,
      resourceIds: ['res-1'],
      monthlySavingsCents: 100_000,
      confidence: 0.9,
      effortHours: 2,
      risk: 0.1,
      generatedAt: now,
      ...overrides,
    };
  }

  it('ranks by savings×confidence/effort', () => {
    const r = new SavingsRanker({}, clock());
    const ranked = r.rank([
      rec({ id: 'low', monthlySavingsCents: 50_000, confidence: 0.5, effortHours: 10 }),
      rec({ id: 'high', monthlySavingsCents: 200_000, confidence: 0.95, effortHours: 2 }),
    ]);
    expect(ranked[0].recommendation.id).toBe('high');
    expect(ranked[0].adjustedRoi).toBeGreaterThan(ranked[1].adjustedRoi);
  });

  it('risk discounts the score', () => {
    const r = new SavingsRanker({ riskPenalty: 1 }, clock());
    const safe = r.score(rec({ risk: 0 }));
    const risky = r.score(rec({ risk: 1 }));
    expect(safe).toBeGreaterThan(risky);
    expect(risky).toBeCloseTo(0, 5);
  });

  it('stale recommendations decay', () => {
    const r = new SavingsRanker({ staleAfterDays: 10, staleHalfLifeDays: 10 }, clock());
    const fresh = r.score(rec({ generatedAt: now }));
    const stale = r.score(rec({ generatedAt: now - 40 * DAY_MS }));
    expect(stale).toBeLessThan(fresh);
    expect(stale).toBeCloseTo(fresh / 8, 1); // 30 days over → 3 half-lives
  });

  it('tiers: top fraction APPLY_NOW, middle PLAN, tail BACKLOG', () => {
    const r = new SavingsRanker({ applyNowMinRoi: 0 }, clock());
    const recs: SavingsRecommendation[] = [];
    for (let i = 0; i < 10; i++) {
      recs.push(rec({ id: `r${i}`, monthlySavingsCents: (10 - i) * 10000, confidence: 0.9 }));
    }
    const ranked = r.rank(recs);
    const applyNow = ranked.filter((x) => x.tier === RecommendationTier.APPLY_NOW);
    const plan = ranked.filter((x) => x.tier === RecommendationTier.PLAN);
    const backlog = ranked.filter((x) => x.tier === RecommendationTier.BACKLOG);
    expect(applyNow.length).toBe(2); // 20% of 10
    expect(plan.length).toBe(5); // next 50%
    expect(backlog.length).toBe(3);
    // Ordering: best first.
    expect(ranked[0].recommendation.id).toBe('r0');
  });

  it('selectWithinBudget greedy-picks max savings under effort cap', () => {
    const r = new SavingsRanker({}, clock());
    const out = r.selectWithinBudget(
      [
        rec({ id: 'a', monthlySavingsCents: 100_000, effortHours: 4 }),
        rec({ id: 'b', monthlySavingsCents: 60_000, effortHours: 4 }),
        rec({ id: 'c', monthlySavingsCents: 90_000, effortHours: 8 }),
      ],
      8
    );
    // a (25k/h) and b (15k/h) beat c (11k/h); a+b = 8h.
    expect(out.selected.map((s) => s.recommendation.id)).toEqual(['a', 'b']);
    expect(out.totalSavingsCents).toBe(160_000);
    expect(out.usedHours).toBe(8);
  });

  it('portfolio aggregates tier savings and quick win', () => {
    const r = new SavingsRanker({ applyNowMinRoi: 0 }, clock());
    const p = r.portfolio([
      rec({ id: 'big', monthlySavingsCents: 300_000 }),
      rec({ id: 'mid', monthlySavingsCents: 100_000 }),
      rec({ id: 'small', monthlySavingsCents: 10_000 }),
      rec({ id: 'smaller', monthlySavingsCents: 5_000 }),
      rec({ id: 'tiny', monthlySavingsCents: 1_000 }),
    ]);
    expect(p.totalMonthlySavingsCents).toBe(416_000);
    expect(p.quickWin?.recommendation.id).toBe('big');
    expect(p.applyNowSavingsCents).toBe(300_000);
  });
});

/* ----------------------------------------------------------------------- */
/* UnitEconomics                                                           */
/* ----------------------------------------------------------------------- */

describe('UnitEconomics', () => {
  const now = 1_700_100_000_000;

  it('computes cost per request over a window', () => {
    const e = new UnitEconomics(new TestClock(now));
    for (let i = 0; i < 7; i++) {
      e.record(UnitDimension.REQUEST, {
        timestamp: now - i * DAY_MS,
        scope: 'api',
        costCents: 10_000,
        volume: 1_000_000,
      });
    }
    const c = e.unitCost('api', UnitDimension.REQUEST, 30 * DAY_MS);
    expect(c).not.toBeNull();
    expect(c!.centsPerUnit).toBeCloseTo(0.01, 6); // 10000c / 1M req
    // Marginal < average with default 0.6 variable fraction.
    expect(c!.marginalCentsPerUnit).toBeCloseTo(0.006, 6);
  });

  it('returns null for unknown scope/dimension', () => {
    const e = new UnitEconomics(new TestClock(now));
    expect(e.unitCost('nobody', UnitDimension.REQUEST, DAY_MS)).toBeNull();
  });

  it('handles zero volume as infinite unit cost', () => {
    const e = new UnitEconomics(new TestClock(now));
    e.record(UnitDimension.GB_STORED, {
      timestamp: now,
      scope: 'archive',
      costCents: 5000,
      volume: 0,
    });
    const c = e.unitCost('archive', UnitDimension.GB_STORED, DAY_MS);
    expect(c!.centsPerUnit).toBe(Number.POSITIVE_INFINITY);
  });

  it('detects deteriorating unit-cost trend', () => {
    const e = new UnitEconomics(new TestClock(now));
    // Flat cost, declining volume → rising cost/unit.
    for (let i = 0; i < 30; i++) {
      e.record(UnitDimension.ACTIVE_USER, {
        timestamp: now - (30 - i) * DAY_MS,
        scope: 'app',
        costCents: 10_000,
        volume: 10_000 - i * 200,
      });
    }
    const t = e.trend('app', UnitDimension.ACTIVE_USER, 30 * DAY_MS, 6);
    expect(t).not.toBeNull();
    expect(t!.slopePerDay).toBeGreaterThan(0);
    expect(t!.deteriorating).toBe(true);
  });

  it('compareScopes ranks efficiency best-first', () => {
    const e = new UnitEconomics(new TestClock(now));
    e.record(UnitDimension.REQUEST, { timestamp: now, scope: 'cheap', costCents: 100, volume: 1000 });
    e.record(UnitDimension.REQUEST, { timestamp: now, scope: 'pricey', costCents: 900, volume: 1000 });
    const cmp = e.compareScopes(UnitDimension.REQUEST, DAY_MS);
    expect(cmp[0].scope).toBe('cheap');
    expect(cmp[1].scope).toBe('pricey');
  });

  it('efficiencyRatio = marginal/average', () => {
    const e = new UnitEconomics(new TestClock(now));
    e.record(UnitDimension.ORDER, { timestamp: now, scope: 'shop', costCents: 1000, volume: 100 });
    expect(e.efficiencyRatio('shop', UnitDimension.ORDER, DAY_MS)).toBeCloseTo(0.6, 6);
  });
});

/* ----------------------------------------------------------------------- */
/* AnomalyRootCause                                                        */
/* ----------------------------------------------------------------------- */

describe('AnomalyRootCause', () => {
  const now = 1_700_100_000_000;
  const DAY = DAY_MS;

  function feed(rc: AnomalyRootCause, extra?: TaggedSpendRecord[]): void {
    // 30 days baseline: stable spend across 3 services.
    for (let i = 1; i <= 30; i++) {
      const t = now - i * DAY;
      rc.ingestAll([
        { timestamp: t, costCenter: 'prod', amountCents: 5000, tags: { service: 'web' } },
        { timestamp: t, costCenter: 'prod', amountCents: 3000, tags: { service: 'db' } },
        { timestamp: t, costCenter: 'prod', amountCents: 2000, tags: { service: 'cache' } },
      ]);
    }
    // Anomaly day: web doubles, db normal, cache gone, 'ml-batch' appears.
    rc.ingestAll([
      { timestamp: now, costCenter: 'prod', amountCents: 12_000, tags: { service: 'web' } },
      { timestamp: now, costCenter: 'prod', amountCents: 3000, tags: { service: 'db' } },
      { timestamp: now, costCenter: 'prod', amountCents: 15_000, tags: { service: 'ml-batch' } },
      ...(extra ?? []),
    ]);
  }

  it('identifies the tag value that drove the spike', () => {
    const rc = new AnomalyRootCause({}, new TestClock(now));
    feed(rc);
    const report = rc.explain('prod', now, DAY, 30 * DAY);
    const services = report.candidates.filter((c) => c.dimension === 'service');
    const ml = services.find((c) => c.value === 'ml-batch');
    expect(ml).toBeDefined();
    // ml-batch appeared out of nowhere → infinite growth ratio.
    expect(ml!.growthRatio).toBe(Number.POSITIVE_INFINITY);
    expect(ml!.excessDeltaCents).toBe(15_000);
  });

  it('values that grew with the crowd are not flagged as root cause', () => {
    const rc = new AnomalyRootCause({ minRatioExcess: 2.0 }, new TestClock(now));
    // Uniform doubling: everything grows 2× — no single culprit.
    for (let i = 1; i <= 30; i++) {
      rc.ingest({
        timestamp: now - i * DAY,
        costCenter: 'prod',
        amountCents: 5000,
        tags: { service: 'web' },
      });
      rc.ingest({
        timestamp: now - i * DAY,
        costCenter: 'prod',
        amountCents: 5000,
        tags: { service: 'db' },
      });
    }
    rc.ingest({ timestamp: now, costCenter: 'prod', amountCents: 10_000, tags: { service: 'web' } });
    rc.ingest({ timestamp: now, costCenter: 'prod', amountCents: 10_000, tags: { service: 'db' } });
    const report = rc.explain('prod', now, DAY, 30 * DAY);
    // Overall growth is 2×; each value also 2× → nothing exceeds crowd.
    expect(report.candidates.length).toBe(0);
  });

  it('contribution shares sum to ≤1 and candidates sorted desc', () => {
    const rc = new AnomalyRootCause({ minDeltaShare: 0.01 }, new TestClock(now));
    feed(rc);
    const report = rc.explain('prod', now, DAY, 30 * DAY);
    const sum = report.candidates.reduce((a, c) => a + c.contributionShare, 0);
    expect(sum).toBeLessThanOrEqual(1.0001);
    for (let i = 1; i < report.candidates.length; i++) {
      expect(report.candidates[i].excessDeltaCents).toBeLessThanOrEqual(
        report.candidates[i - 1].excessDeltaCents
      );
    }
  });

  it('unattributedCents captures the unexplained remainder', () => {
    const rc = new AnomalyRootCause({ minDeltaShare: 0.5 }, new TestClock(now));
    // Anomaly smeared evenly across many tags — nothing hits 50% share.
    for (let i = 1; i <= 30; i++) {
      rc.ingest({
        timestamp: now - i * DAY,
        costCenter: 'prod',
        amountCents: 10_000,
        tags: { service: 'a' },
      });
    }
    for (const v of ['a', 'b', 'c', 'd']) {
      rc.ingest({ timestamp: now, costCenter: 'prod', amountCents: 7500, tags: { service: v } });
    }
    const report = rc.explain('prod', now, DAY, 30 * DAY);
    expect(report.unattributedCents).toBeGreaterThan(0);
  });

  it('respects the dimensions config to decompose only on chosen keys', () => {
    const rc = new AnomalyRootCause({ dimensions: ['region'] }, new TestClock(now));
    for (let i = 1; i <= 30; i++) {
      rc.ingest({
        timestamp: now - i * DAY,
        costCenter: 'prod',
        amountCents: 1000,
        tags: { service: 'web', region: 'us-east' },
      });
    }
    rc.ingest({
      timestamp: now,
      costCenter: 'prod',
      amountCents: 9000,
      tags: { service: 'web', region: 'eu-west' },
    });
    const report = rc.explain('prod', now, DAY, 30 * DAY);
    expect(report.candidates.every((c) => c.dimension === 'region')).toBe(true);
    expect(report.candidates.some((c) => c.value === 'eu-west')).toBe(true);
  });

  it('totalGrowthRatio reflects the rate change', () => {
    const rc = new AnomalyRootCause({}, new TestClock(now));
    feed(rc);
    const report = rc.explain('prod', now, DAY, 30 * DAY);
    // Baseline 10k/day → anomaly 30k/day = 3×.
    expect(report.totalGrowthRatio).toBeCloseTo(3, 5);
  });
});
