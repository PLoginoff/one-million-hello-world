/**
 * OLAP aggregation engine tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { OlapEngine } from '../engine/OlapEngine';
import type { Row } from '../engine/ColumnStorageEngine';

const SALES: Row[] = [
  { region: 'us', product: 'a', channel: 'web', amount: 10, qty: 1 },
  { region: 'us', product: 'a', channel: 'store', amount: 20, qty: 2 },
  { region: 'us', product: 'b', channel: 'web', amount: 30, qty: 3 },
  { region: 'eu', product: 'a', channel: 'web', amount: 40, qty: 4 },
  { region: 'eu', product: 'b', channel: 'store', amount: 50, qty: 5 },
  { region: 'eu', product: 'b', channel: 'web', amount: 60, qty: 6 },
];

describe('OlapEngine — groupBy', () => {
  let engine: OlapEngine;
  beforeEach(() => {
    engine = new OlapEngine();
  });

  it('single-column groupBy with sum', () => {
    const res = engine.groupBy(SALES, ['region'], [{ fn: 'sum', column: 'amount', alias: 'total' }]);
    expect(res.groupingSets).toBe(1);
    expect(res.rows.length).toBe(2);
    const us = res.rows.find((r) => r.key.region === 'us');
    const eu = res.rows.find((r) => r.key.region === 'eu');
    expect(us?.values.total).toBe(60);
    expect(eu?.values.total).toBe(150);
  });

  it('multi-column groupBy', () => {
    const res = engine.groupBy(SALES, ['region', 'product'], [{ fn: 'count' }]);
    expect(res.rows.length).toBe(4); // us/a, us/b, eu/a, eu/b
    for (const r of res.rows) {
      const expected = r.key.region === 'us' && r.key.product === 'a' ? 2 : r.key.region === 'eu' && r.key.product === 'b' ? 2 : 1;
      expect(r.values['count(*)']).toBe(expected);
    }
  });

  it('avg computes correctly', () => {
    const res = engine.groupBy(SALES, ['region'], [{ fn: 'avg', column: 'amount' }]);
    const us = res.rows.find((r) => r.key.region === 'us');
    expect(us?.values['avg(amount)']).toBeCloseTo(20);
  });

  it('countDistinct counts uniques', () => {
    const res = engine.groupBy(SALES, [], [{ fn: 'countDistinct', column: 'product' }]);
    expect(res.rows[0].values['countDistinct(product)']).toBe(2);
  });

  it('min/max work on mixed types', () => {
    const res = engine.groupBy(SALES, [], [
      { fn: 'min', column: 'amount' },
      { fn: 'max', column: 'region' },
    ]);
    expect(res.rows[0].values['min(amount)']).toBe(10);
    expect(res.rows[0].values['max(region)']).toBe('us');
  });

  it('stddev via Welford matches closed-form', () => {
    const rows: Row[] = [2, 4, 4, 4, 5, 5, 7, 9].map((v) => ({ v }));
    const res = engine.groupBy(rows, [], [{ fn: 'stddev', column: 'v' }]);
    // population stddev of the classic example = 2
    expect(res.rows[0].values['stddev(v)'] as number).toBeCloseTo(2, 5);
  });

  it('nulls are skipped by sum/avg', () => {
    const rows: Row[] = [{ g: 'x', v: null }, { g: 'x', v: 10 }, { g: 'x', v: null }];
    const res = engine.groupBy(rows, ['g'], [{ fn: 'sum', column: 'v' }, { fn: 'count', column: 'v', alias: 'nn' }]);
    expect(res.rows[0].values['sum(v)']).toBe(10);
    expect(res.rows[0].values.nn).toBe(1);
  });
});

describe('OlapEngine — rollup', () => {
  let engine: OlapEngine;
  beforeEach(() => {
    engine = new OlapEngine();
  });

  it('rollup produces h+1 grouping sets', () => {
    const res = engine.rollup(SALES, ['region', 'product'], [{ fn: 'sum', column: 'amount', alias: 's' }]);
    expect(res.groupingSets).toBe(3); // {r,p}, {r}, {}
    // Grand total row has empty key
    const grand = res.rows.find((r) => r.groupingMask === 0b11);
    expect(grand?.values.s).toBe(210);
    // Region subtotals: mask bit1 set (product aggregated)
    const usSub = res.rows.find((r) => r.key.region === 'us' && r.groupingMask === 0b10);
    expect(usSub?.values.s).toBe(60);
  });

  it('3-level rollup', () => {
    const res = engine.rollup(SALES, ['region', 'product', 'channel'], [{ fn: 'count', alias: 'c' }]);
    expect(res.groupingSets).toBe(4);
    const grand = res.rows.find((r) => r.groupingMask === 0b111);
    expect(grand?.values.c).toBe(6);
  });
});

describe('OlapEngine — cube', () => {
  let engine: OlapEngine;
  beforeEach(() => {
    engine = new OlapEngine();
  });

  it('cube produces 2^h grouping sets', () => {
    const res = engine.cube(SALES, ['region', 'product'], [{ fn: 'sum', column: 'amount', alias: 's' }]);
    expect(res.groupingSets).toBe(4); // {}, {r}, {p}, {r,p}
    // product-only aggregation: mask bit0 set (region aggregated)
    const prodA = res.rows.find((r) => r.key.product === 'a' && r.groupingMask === 0b01);
    expect(prodA?.values.s).toBe(70); // 10+20+40
  });

  it('cube on 3 cols → 8 sets', () => {
    const res = engine.cube(SALES.slice(0, 3), ['region', 'product', 'channel'], [{ fn: 'count', alias: 'c' }]);
    expect(res.groupingSets).toBe(8);
  });
});

describe('OlapEngine — window functions', () => {
  let engine: OlapEngine;
  beforeEach(() => {
    engine = new OlapEngine();
  });

  it('rowNumber assigns sequential ranks', () => {
    const res = engine.rank(SALES, ['region'], [{ column: 'amount', direction: 'desc' }], 'rowNumber');
    const usRanks = res.filter((r) => r.row.region === 'us').sort((a, b) => a.rank - b.rank);
    expect(usRanks[0].row.amount).toBe(30);
    expect(usRanks[2].row.amount).toBe(10);
  });

  it('rank gives ties the same rank with gaps', () => {
    const rows: Row[] = [{ p: 'a', v: 10 }, { p: 'a', v: 10 }, { p: 'a', v: 5 }];
    const res = engine.rank(rows, ['p'], [{ column: 'v', direction: 'desc' }], 'rank');
    const ranks = res.map((r) => r.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 1, 3]);
  });

  it('denseRank gives ties the same rank without gaps', () => {
    const rows: Row[] = [{ p: 'a', v: 10 }, { p: 'a', v: 10 }, { p: 'a', v: 5 }];
    const res = engine.rank(rows, ['p'], [{ column: 'v', direction: 'desc' }], 'denseRank');
    const ranks = res.map((r) => r.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 1, 2]);
  });

  it('window computes running sum with frame', () => {
    const rows: Row[] = [1, 2, 3, 4, 5].map((v) => ({ g: 'x', v }));
    const res = engine.window(
      rows,
      ['g'],
      [{ column: 'v', direction: 'asc' }],
      { fn: 'sum', column: 'v' },
      1, // one before
      0 // current row
    );
    // frame [i-1, i]: sums = 1, 3, 5, 7, 9
    const values = res.map((r) => r.value);
    expect(values).toEqual([1, 3, 5, 7, 9]);
  });
});
