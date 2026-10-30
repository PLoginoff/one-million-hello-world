/**
 * Data Quality Engine2 — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { DQRow, QualityDimension, RuleResult } from '../engine/QualityRules';
import { DeepProfiler, StringPattern } from '../engine2/DataProfiler';
import { QualityScorer } from '../engine2/QualityScoring';
import { QualityTrendTracker } from '../engine2/QualityTrend';
import { RuleSuggester } from '../engine2/RuleSuggester';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

function clock(start = T0): { now(): number; advance(ms: number): void } {
  let t = start;
  return { now: () => t, advance: (ms) => void (t += ms) };
}

function makeRuleResult(
  dimension: QualityDimension,
  violationRatio: number,
  severity: RuleResult['severity'] = 'error',
  rowsEvaluated = 1000
): RuleResult {
  return {
    ruleId: `r-${dimension}`,
    ruleName: `${dimension} rule`,
    dimension,
    rowsEvaluated,
    violationCount: Math.round(violationRatio * rowsEvaluated),
    violationRatio,
    severity,
    passed: violationRatio === 0,
  };
}

/* ----------------------------------------------------------------------- */
/* DeepProfiler                                                            */
/* ----------------------------------------------------------------------- */

describe('DeepProfiler', () => {
  it('computes cardinality, completeness, and null/empty breakdown', () => {
    const rows: DQRow[] = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: '' },
      { id: 4, name: null },
      { id: 5, name: 'a' },
      { id: 6 }, // missing → implicit null
    ];
    const p = new DeepProfiler();
    const prof = p.profileColumn(rows, 'name');
    expect(prof.rowCount).toBe(6);
    expect(prof.nullCount).toBe(2); // null + missing
    expect(prof.emptyStringCount).toBe(1);
    expect(prof.nonNullCount).toBe(4); // '' counts as present but flagged separately
    expect(prof.distinctCount).toBe(3); // '', 'a', 'b'
    expect(prof.completeness).toBeCloseTo(4 / 6, 5);
  });

  it('top-k returns most frequent values with frequencies', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 100; i++) {
      rows.push({ status: i < 60 ? 'ok' : i < 90 ? 'warn' : 'crit' });
    }
    const prof = new DeepProfiler({ topK: 2 }).profileColumn(rows, 'status');
    expect(prof.topK.length).toBe(2);
    expect(prof.topK[0].value).toBe('ok');
    expect(prof.topK[0].count).toBe(60);
    expect(prof.topK[0].frequency).toBeCloseTo(0.6, 5);
    expect(prof.topK[1].value).toBe('warn');
  });

  it('builds equi-width histograms over numeric columns', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 100; i++) rows.push({ v: i });
    const prof = new DeepProfiler({ histogramBuckets: 10 }).profileColumn(rows, 'v');
    expect(prof.histogram.length).toBe(10);
    const total = prof.histogram.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(100);
    // Uniform distribution → roughly 10 per bucket.
    for (const b of prof.histogram) {
      expect(b.count).toBe(10);
      expect(b.density).toBeCloseTo(0.1, 5);
    }
  });

  it('detects dominant string patterns', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 50; i++) {
      rows.push({ contact: i < 45 ? `u${i}@x.com` : 'not-an-email' });
    }
    const prof = new DeepProfiler().profileColumn(rows, 'contact');
    expect(prof.dominantPattern?.pattern).toBe(StringPattern.EMAIL);
    expect(prof.dominantPattern?.share).toBeCloseTo(0.9, 5);
  });

  it('computes numeric stats via Welford', () => {
    const rows: DQRow[] = [{ v: 2 }, { v: 4 }, { v: 4 }, { v: 4 }, { v: 5 }, { v: 5 }, { v: 7 }, { v: 9 }];
    const prof = new DeepProfiler().profileColumn(rows, 'v');
    expect(prof.mean).toBeCloseTo(5, 5);
    // Population stddev of the classic example is 2, sample is ~2.138.
    expect(prof.stddev).toBeCloseTo(Math.sqrt(32 / 7), 3);
    expect(prof.min).toBe(2);
    expect(prof.max).toBe(9);
  });

  it('flags cardinality ratio ≈1 as a key candidate', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 50; i++) rows.push({ id: `uuid-${i}` });
    const prof = new DeepProfiler().profileColumn(rows, 'id');
    expect(prof.cardinalityRatio).toBe(1);
    expect(prof.cardinalityTruncated).toBe(false);
  });

  it('records type distribution', () => {
    const rows: DQRow[] = [{ v: 1 }, { v: 'x' }, { v: true }, { v: 2 }];
    const prof = new DeepProfiler().profileColumn(rows, 'v');
    expect(prof.typeDistribution.number).toBe(2);
    expect(prof.typeDistribution.string).toBe(1);
    expect(prof.typeDistribution.boolean).toBe(1);
  });

  it('profileTable unions columns across rows', () => {
    const rows: DQRow[] = [{ a: 1 }, { b: 'x' }, { a: 2, c: true }];
    const out = new DeepProfiler().profileTable(rows);
    expect([...out.keys()].sort()).toEqual(['a', 'b', 'c']);
  });
});

/* ----------------------------------------------------------------------- */
/* QualityScorer                                                           */
/* ----------------------------------------------------------------------- */

describe('QualityScorer', () => {
  it('perfect results score 100/A', () => {
    const s = new QualityScorer();
    const score = s.score([
      makeRuleResult('completeness', 0),
      makeRuleResult('validity', 0),
    ]);
    expect(score.total).toBe(100);
    expect(score.grade).toBe('A');
    expect(score.passing).toBe(true);
  });

  it('severity-weighted violations drag the composite down', () => {
    const s = new QualityScorer();
    const clean = s.score([makeRuleResult('completeness', 0)]);
    const dirty = s.score([makeRuleResult('completeness', 0.5, 'critical')]);
    expect(dirty.total).toBeLessThan(clean.total);
    expect(dirty.passing).toBe(false);
  });

  it('dimension weights shift the composite toward heavier dims', () => {
    const s = new QualityScorer({
      weights: { completeness: 10, anomaly: 1 },
    });
    // completeness failing hard, anomaly perfect → total dominated by completeness.
    const score = s.score([
      makeRuleResult('completeness', 1.0, 'critical'),
      makeRuleResult('anomaly', 0),
    ]);
    // completeness ≈ 0, anomaly = 100 → (0*10 + 100*1)/11 ≈ 9.1
    expect(score.total).toBeLessThan(20);
    expect(score.weakest?.dimension).toBe('completeness');
  });

  it('graded ramp: warnAt → failAt → 2×failAt', () => {
    const s = new QualityScorer({ defaultGrading: { warnAt: 0.1, failAt: 0.3 } });
    const belowWarn = s.score([makeRuleResult('completeness', 0.05)]);
    const mid = s.score([makeRuleResult('completeness', 0.2)]);
    const atFail = s.score([makeRuleResult('completeness', 0.3)]);
    const double = s.score([makeRuleResult('completeness', 0.6)]);
    expect(belowWarn.total).toBe(100);
    expect(mid.total).toBeCloseTo(75, 3);
    expect(atFail.total).toBeCloseTo(50, 3);
    expect(double.total).toBe(0);
  });

  it('letter grades map to score bands', () => {
    const s = new QualityScorer();
    expect(s.score([makeRuleResult('completeness', 0)]).grade).toBe('A');
    // Force a mid-grade with a failing dimension.
    const mid = s.score([makeRuleResult('completeness', 0.15)]);
    expect(['C', 'D', 'F']).toContain(mid.grade);
  });
});

/* ----------------------------------------------------------------------- */
/* QualityTrendTracker                                                     */
/* ----------------------------------------------------------------------- */

describe('QualityTrendTracker', () => {
  it('detects a sustained degrading trend', () => {
    const c = clock();
    const t = new QualityTrendTracker({ minPoints: 5, alertSlope: -0.5 }, c);
    for (let i = 0; i < 10; i++) {
      t.record('table-a', 95 - i * 3, c.now());
      c.advance(DAY);
    }
    const alert = t.analyze('table-a');
    expect(alert).not.toBeNull();
    expect(alert!.kind === 'trend' || alert!.kind === 'both').toBe(true);
    expect(alert!.trend.slopePerDay).toBeLessThan(-0.5);
    expect(alert!.trend.daysToFloor).not.toBeNull();
  });

  it('detects a step-down change-point', () => {
    const c = clock();
    const t = new QualityTrendTracker(
      { minPoints: 8, changePointEdgeMargin: 2, minChangePointSignificance: 1.5 },
      c
    );
    // 8 points at ~95 then 8 at ~60 — a sudden drop, low slope otherwise.
    for (let i = 0; i < 8; i++) {
      t.record('table-b', 95 + (i % 2), c.now());
      c.advance(DAY);
    }
    for (let i = 0; i < 8; i++) {
      t.record('table-b', 60 + (i % 2), c.now());
      c.advance(DAY);
    }
    const cp = t.detectChangePoint('table-b');
    expect(cp).not.toBeNull();
    expect(cp!.meanBefore).toBeGreaterThan(90);
    expect(cp!.meanAfter).toBeLessThan(70);
    const alert = t.analyze('table-b');
    expect(alert).not.toBeNull();
    expect(alert!.kind === 'change-point' || alert!.kind === 'both').toBe(true);
  });

  it('no alert on a stable series', () => {
    const c = clock();
    const t = new QualityTrendTracker({ minPoints: 5 }, c);
    for (let i = 0; i < 10; i++) {
      t.record('stable', 90 + (i % 3), c.now());
      c.advance(DAY);
    }
    expect(t.analyze('stable')).toBeNull();
  });

  it('returns null below minPoints', () => {
    const t = new QualityTrendTracker({ minPoints: 5 }, clock());
    t.record('s', 50);
    t.record('s', 49);
    expect(t.trend('s')).toBeNull();
    expect(t.analyze('s')).toBeNull();
  });

  it('separates series', () => {
    const c = clock();
    const t = new QualityTrendTracker({ minPoints: 5 }, c);
    for (let i = 0; i < 6; i++) {
      t.record('good', 95, c.now());
      t.record('bad', 90 - i * 5, c.now());
      c.advance(DAY);
    }
    expect(t.analyze('good')).toBeNull();
    expect(t.analyze('bad')).not.toBeNull();
  });
});

/* ----------------------------------------------------------------------- */
/* RuleSuggester                                                           */
/* ----------------------------------------------------------------------- */

describe('RuleSuggester', () => {
  function profiler(): DeepProfiler {
    return new DeepProfiler();
  }

  it('suggests uniqueness rule for a key column', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 100; i++) rows.push({ id: `k${i}` });
    const prof = profiler().profileColumn(rows, 'id');
    const sug = new RuleSuggester({ minConfidence: 0.5 }).suggest(prof);
    expect(sug.some((s) => s.ruleKind === 'uniqueness')).toBe(true);
  });

  it('suggests regex rule for email-shaped column', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 100; i++) rows.push({ email: `u${i}@x.com` });
    const prof = profiler().profileColumn(rows, 'email');
    const sug = new RuleSuggester({ patternShareThreshold: 0.8 }).suggest(prof);
    const regex = sug.find((s) => s.ruleKind === 'validity-regex');
    expect(regex).toBeDefined();
    expect(regex!.params.pattern).toContain('@');
  });

  it('suggests range rule with margin for numeric columns', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 50; i++) rows.push({ age: 18 + i });
    const prof = profiler().profileColumn(rows, 'age');
    const sug = new RuleSuggester({ rangeMarginRatio: 0.1, minConfidence: 0.5 }).suggest(prof);
    const range = sug.find((s) => s.ruleKind === 'validity-range');
    expect(range).toBeDefined();
    expect(range!.params.min).toBeLessThan(18);
    expect(range!.params.max).toBeGreaterThan(67);
  });

  it('suggests enum rule for low-cardinality columns', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 200; i++) rows.push({ status: ['open', 'closed', 'pending'][i % 3] });
    const prof = profiler().profileColumn(rows, 'status');
    const sug = new RuleSuggester({ minConfidence: 0.5 }).suggest(prof);
    const en = sug.find((s) => s.ruleKind === 'validity-enum');
    expect(en).toBeDefined();
    expect((en!.params.allowedValues as string[]).sort()).toEqual(['closed', 'open', 'pending']);
  });

  it('suggests freshness for timestamp columns', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 50; i++) rows.push({ ts: `2024-01-0${(i % 9) + 1}T10:00:00Z` });
    const prof = profiler().profileColumn(rows, 'ts');
    const sug = new RuleSuggester({ patternShareThreshold: 0.8, minConfidence: 0.5 }).suggest(prof);
    expect(sug.some((s) => s.ruleKind === 'freshness')).toBe(true);
  });

  it('does not suggest completeness for a full column', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 50; i++) rows.push({ x: i });
    const prof = profiler().profileColumn(rows, 'x');
    const sug = new RuleSuggester().suggest(prof);
    expect(sug.every((s) => s.ruleKind !== 'completeness')).toBe(true);
  });

  it('suggestAll sorts by confidence desc', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 100; i++) {
      rows.push({ id: `k${i}`, status: i % 2 === 0 ? 'a' : 'b' });
    }
    const profs = profiler().profileTable(rows);
    const sug = new RuleSuggester({ minConfidence: 0.5 }).suggestAll(profs);
    expect(sug.length).toBeGreaterThan(1);
    for (let i = 1; i < sug.length; i++) {
      expect(sug[i].confidence).toBeLessThanOrEqual(sug[i - 1].confidence);
    }
  });
});
