/**
 * Data quality rules engine tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  AccuracyRule,
  AnomalyRule,
  ColumnProfiler,
  CompletenessRule,
  ConsistencyRule,
  FreshnessRule,
  QualityEngine,
  UniquenessRule,
  ValidityRule,
} from '../engine/QualityRules';
import type { DQRow } from '../engine/QualityRules';

const CUSTOMERS: DQRow[] = [
  { id: 1, email: 'a@x.com', age: 30, country: 'us', created: '2024-01-01', start: 1, end: 5 },
  { id: 2, email: 'b@x.com', age: 40, country: 'de', created: '2024-01-02', start: 2, end: 9 },
  { id: 3, email: 'bad-email', age: 17, country: 'xx', created: '2024-01-03', start: 8, end: 3 },
  { id: 3, email: 'a@x.com', age: null, country: 'us', created: '2024-01-04', start: 1, end: 2 },
];

describe('CompletenessRule', () => {
  it('passes when ratio met', () => {
    const r = new CompletenessRule('c1', 'age present', 'age', 0.7);
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.length).toBe(0); // 3/4 = 75% ≥ 70%
  });

  it('fails dataset-level when below threshold', () => {
    const r = new CompletenessRule('c1', 'age present', 'age', 0.9);
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.length).toBe(1);
    expect(v[0].rowIndex).toBe(-1);
    expect(v[0].message).toContain('75.0%');
  });

  it('treats empty string as missing', () => {
    const rows: DQRow[] = [{ n: '' }, { n: 'x' }];
    const r = new CompletenessRule('c', 'n', 'n', 0.9);
    expect(r.evaluate({ rows, now: 0 }).length).toBe(1);
  });
});

describe('UniquenessRule', () => {
  it('flags exact duplicate keys', () => {
    const r = new UniquenessRule('u1', 'id unique', ['id']);
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.length).toBe(1);
    expect(v[0].rowIndex).toBe(3);
    expect(v[0].message).toContain('duplicate of row 2');
  });

  it('composite keys', () => {
    const r = new UniquenessRule('u2', 'id+email', ['id', 'email']);
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.length).toBe(0); // id+email pairs are all distinct
  });

  it('approximate mode normalizes case/whitespace', () => {
    const rows: DQRow[] = [{ name: '  Alice ' }, { name: 'alice' }, { name: 'BOB' }];
    const r = new UniquenessRule('u3', 'name', ['name'], 'warn', true);
    const v = r.evaluate({ rows, now: 0 });
    expect(v.length).toBe(1);
    expect(v[0].rowIndex).toBe(1);
  });
});

describe('ValidityRule', () => {
  it('regex rejects malformed emails', () => {
    const r = new ValidityRule('v1', 'email fmt', 'email', { kind: 'regex', pattern: '^[^@]+@[^@]+$' });
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.length).toBe(1);
    expect(v[0].rowIndex).toBe(2);
  });

  it('range checks min/max', () => {
    const r = new ValidityRule('v2', 'adult', 'age', { kind: 'range', min: 18, max: 120 });
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.length).toBe(1);
    expect(v[0].value).toBe(17);
  });

  it('enum restricts allowed values', () => {
    const r = new ValidityRule('v3', 'country', 'country', { kind: 'enum', allowed: ['us', 'de', 'fr'] });
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.length).toBe(1);
    expect(v[0].value).toBe('xx');
  });

  it('email shorthand', () => {
    const r = new ValidityRule('v4', 'email', 'email', { kind: 'email' });
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.length).toBe(1);
  });

  it('type checks', () => {
    const rows: DQRow[] = [{ v: 'x' }, { v: 5 }];
    const r = new ValidityRule('v5', 'num', 'v', { kind: 'type', type: 'number' });
    const v = r.evaluate({ rows, now: 0 });
    expect(v.length).toBe(1);
    expect(v[0].rowIndex).toBe(0);
  });

  it('skips nulls (completeness owns them)', () => {
    const r = new ValidityRule('v6', 'age', 'age', { kind: 'range', min: 0 });
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.every((x) => x.value !== null)).toBe(true);
  });
});

describe('ConsistencyRule', () => {
  it('flags rows where start >= end', () => {
    const r = new ConsistencyRule('k1', 'start<end', (row) => (row.start as number) < (row.end as number), 'start must precede end', ['start', 'end']);
    const v = r.evaluate({ rows: CUSTOMERS, now: 0 });
    expect(v.length).toBe(1);
    expect(v[0].rowIndex).toBe(2);
  });
});

describe('AccuracyRule', () => {
  it('flags values absent from reference', () => {
    const refs = new Map<string, DQRow[]>([['countries', [{ code: 'us' }, { code: 'de' }]]]);
    const r = new AccuracyRule('a1', 'valid country', 'country', 'countries', 'code');
    const v = r.evaluate({ rows: CUSTOMERS, now: 0, references: refs });
    expect(v.length).toBe(1);
    expect(v[0].value).toBe('xx');
  });

  it('missing reference dataset is critical violation', () => {
    const r = new AccuracyRule('a2', 'valid', 'country', 'missing', 'code');
    const v = r.evaluate({ rows: CUSTOMERS, now: 0, references: new Map() });
    expect(v.length).toBe(1);
    expect(v[0].severity).toBe('critical');
  });
});

describe('FreshnessRule', () => {
  it('fails when newest record is stale', () => {
    const now = Date.parse('2024-02-01');
    const r = new FreshnessRule('f1', 'recent data', 'created', 7 * 24 * 3600 * 1000);
    const v = r.evaluate({ rows: CUSTOMERS, now });
    expect(v.length).toBe(1);
    expect(v[0].message).toContain('min old');
  });

  it('passes fresh data', () => {
    const now = Date.parse('2024-01-04T12:00:00Z');
    const r = new FreshnessRule('f1', 'recent', 'created', 7 * 24 * 3600 * 1000);
    const v = r.evaluate({ rows: CUSTOMERS, now });
    expect(v.length).toBe(0);
  });
});

describe('ColumnProfiler + AnomalyRule', () => {
  it('profiles numeric columns', () => {
    const p = new ColumnProfiler();
    const rows: DQRow[] = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: null }];
    const prof = p.profile(rows, ['v']).get('v');
    expect(prof?.count).toBe(5);
    expect(prof?.nullCount).toBe(1);
    expect(prof?.mean).toBeCloseTo(2.5);
    expect(prof?.stddev).toBeGreaterThan(1);
    expect(prof?.percentiles.get(0.5)).toBeCloseTo(2); // nearest-rank p50 of [1,2,3,4]
  });

  it('AnomalyRule flags outliers via z-score', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 100; i++) rows.push({ v: 10 + (i % 3) }); // ~10-12
    rows.push({ v: 500 }); // massive outlier
    const profiler = new ColumnProfiler();
    const profiles = profiler.profile(rows, ['v']);
    const r = new AnomalyRule('an1', 'v outlier', 'v', 3);
    const v = r.evaluate({ rows, now: 0, profiles });
    expect(v.length).toBe(1);
    expect(v[0].value).toBe(500);
  });
});

describe('QualityEngine', () => {
  let engine: QualityEngine;
  beforeEach(() => {
    engine = new QualityEngine();
  });

  it('aggregates report with score and status', () => {
    engine
      .addRule(new ValidityRule('v1', 'email', 'email', { kind: 'email' }))
      .addRule(new UniquenessRule('u1', 'id', ['id']))
      .addRule(new CompletenessRule('c1', 'age', 'age', 0.9));
    const report = engine.evaluate(CUSTOMERS);
    expect(report.rulesEvaluated).toBe(3);
    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.status).toBe('fail');
    expect(report.score).toBeLessThan(100);
    expect(report.score).toBeGreaterThanOrEqual(0);
  });

  it('quarantines only error-severity violating rows', () => {
    engine
      .addRule(new ValidityRule('v1', 'email', 'email', { kind: 'email' }, 'error'))   // row 2
      .addRule(new ValidityRule('v2', 'country', 'country', { kind: 'enum', allowed: ['us', 'de', 'xx'] }, 'warn'));
    const report = engine.evaluate(CUSTOMERS);
    expect(report.quarantinedRows).toEqual([2]);
    expect(report.acceptedRows).toEqual([0, 1, 3]);
  });

  it('partition splits rows with their violations', () => {
    engine.addRule(new ValidityRule('v1', 'email', 'email', { kind: 'email' }));
    const report = engine.evaluate(CUSTOMERS);
    const { accepted, quarantined } = engine.partition(CUSTOMERS, report);
    expect(accepted.length).toBe(3);
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].violations.length).toBeGreaterThan(0);
    expect(quarantined[0].row.email).toBe('bad-email');
  });

  it('clean batch scores 100 and passes', () => {
    const rows: DQRow[] = [{ id: 1, email: 'a@b.com' }, { id: 2, email: 'c@d.com' }];
    engine
      .addRule(new ValidityRule('v', 'e', 'email', { kind: 'email' }))
      .addRule(new UniquenessRule('u', 'id', ['id']))
      .addRule(new CompletenessRule('c', 'id', 'id', 1));
    const report = engine.evaluate(rows);
    expect(report.status).toBe('pass');
    expect(report.score).toBe(100);
    expect(report.quarantinedRows.length).toBe(0);
  });

  it('failureThreshold tolerates small violation ratios', () => {
    const rows: DQRow[] = [];
    for (let i = 0; i < 100; i++) rows.push({ v: 'x' });
    rows.push({ v: 'BAD' });
    engine.addRule(new ValidityRule('v', 'v', 'v', { kind: 'enum', allowed: ['x'] }, 'error', 0.05));
    const report = engine.evaluate(rows);
    // 1/100 = 1% ≤ 5% threshold → rule passes despite violation
    expect(report.ruleResults[0].passed).toBe(true);
    expect(report.status).toBe('pass');
    expect(report.quarantinedRows).toEqual([100]); // row still quarantined
  });
});
