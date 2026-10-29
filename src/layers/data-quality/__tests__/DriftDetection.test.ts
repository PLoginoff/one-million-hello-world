/**
 * Drift detection & reconciliation tests.
 */

import { describe, it, expect } from 'bun:test';
import { driftReport, jsDivergence, ksTest, psi, reconcile } from '../engine/DriftDetection';
import type { DQRow } from '../engine/QualityRules';

function normalish(n: number, shift = 0): number[] {
  // Deterministic pseudo-normal via sum of uniforms (CLT).
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < 12; k++) s += ((i * 7 + k * 13) % 97) / 97;
    out.push(s - 6 + shift);
  }
  return out;
}

describe('ksTest', () => {
  it('identical unique samples → D=0, no drift', () => {
    const a = Array.from({ length: 200 }, (_, i) => i);
    const res = ksTest(a, a.slice());
    expect(res.ksStatistic).toBe(0);
    expect(res.drifted).toBe(false);
  });

  it('same generator → small D, no drift', () => {
    const a = normalish(200);
    const res = ksTest(a, a.slice());
    expect(res.ksStatistic).toBeLessThan(0.15);
    expect(res.drifted).toBe(false);
  });

  it('shifted distribution → drift detected', () => {
    const a = normalish(300);
    const b = normalish(300, 2);
    const res = ksTest(a, b);
    expect(res.ksStatistic).toBeGreaterThan(0.5);
    expect(res.drifted).toBe(true);
    expect(res.meanShiftSigma).toBeGreaterThan(1);
  });

  it('throws on empty input', () => {
    expect(() => ksTest([], [1])).toThrow('non-empty');
  });
});

describe('psi', () => {
  it('same distribution → stable', () => {
    const v = ['a', 'a', 'b', 'c'];
    const res = psi(v, v, (x) => x);
    expect(res.verdict).toBe('stable');
    expect(res.psi).toBeLessThan(0.1);
  });

  it('shifted distribution → drifted', () => {
    const ref = Array(100).fill('a').concat(Array(100).fill('b'));
    const cur = Array(190).fill('a').concat(Array(10).fill('b'));
    const res = psi(ref, cur, (x) => x);
    expect(res.psi).toBeGreaterThan(0.1);
    expect(res.verdict === 'moderate' || res.verdict === 'drifted').toBe(true);
  });
});

describe('jsDivergence', () => {
  it('identical → 0, disjoint → ~1', () => {
    expect(jsDivergence(['a', 'b'], ['a', 'b'], (x) => x)).toBeCloseTo(0, 5);
    const d = jsDivergence(['a', 'a'], ['b', 'b'], (x) => x);
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThanOrEqual(1);
  });
});

describe('reconcile', () => {
  const left: DQRow[] = [
    { id: 1, v: 'a', amt: 10 },
    { id: 2, v: 'b', amt: 20 },
    { id: 3, v: 'c', amt: 30 },
  ];
  const right: DQRow[] = [
    { id: 1, v: 'a', amt: 10 },
    { id: 2, v: 'b', amt: 99 }, // mismatch
    { id: 4, v: 'd', amt: 40 }, // extra
  ];

  it('reports missing keys and field mismatches', () => {
    const r = reconcile(left, right, (row) => String(row.id));
    expect(r.matchedKeys).toBe(2);
    expect(r.missingOnRight).toEqual(['3']);
    expect(r.missingOnLeft).toEqual(['4']);
    expect(r.fieldMismatches.length).toBe(1);
    expect(r.fieldMismatches[0].field).toBe('amt');
    expect(r.reconciled).toBe(false);
  });

  it('clean copies reconcile', () => {
    const r = reconcile(left, left.slice(), (row) => String(row.id));
    expect(r.reconciled).toBe(true);
  });

  it('ignoreFields skips volatile columns', () => {
    const l = [{ id: 1, ts: 100, v: 'x' }];
    const r = [{ id: 1, ts: 999, v: 'x' }];
    const res = reconcile(l, r, (row) => String(row.id), { ignoreFields: ['ts'] });
    expect(res.reconciled).toBe(true);
  });

  it('float tolerance for computed columns', () => {
    const l = [{ id: 1, v: 0.1 + 0.2 }];
    const r = [{ id: 1, v: 0.3 }];
    const res = reconcile(l, r, (row) => String(row.id));
    expect(res.reconciled).toBe(true);
  });
});

describe('driftReport', () => {
  it('routes numeric → KS, categorical → PSI', () => {
    const ref: DQRow[] = normalish(50).map((v, i) => ({ num: v, cat: `c${i % 3}` }));
    const cur: DQRow[] = normalish(50, 3).map((v, i) => ({ num: v, cat: `c${i % 3}` }));
    const report = driftReport(ref, cur, ['num', 'cat']);
    expect(report[0].kind).toBe('numeric');
    expect(report[0].numeric?.drifted).toBe(true);
    expect(report[1].kind).toBe('categorical');
    expect(report[1].psi?.verdict).toBe('stable');
  });
});
