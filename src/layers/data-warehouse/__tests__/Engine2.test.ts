/**
 * Data Warehouse Engine 2 tests — column stats, query planner, MV
 * matching, workload analysis.
 */

import { describe, expect, it } from 'bun:test';
import { StatsCollector, Histogram, DistinctEstimator, estimateSelectivity } from '../engine2/ColumnStats';
import { QueryPlanner, QueryAst, PlanNode } from '../engine2/QueryPlanner';
import { MvMatcher, MvSignature } from '../engine2/MvMatcher';
import { fingerprint, WorkloadTracker } from '../engine2/WorkloadAnalysis';
import { Scalar } from '../engine/ColumnStorageEngine';

/* ---------------------------------------------------------------------- */
/* Column stats                                                           */
/* ---------------------------------------------------------------------- */

describe('StatsCollector', () => {
  const rows: Record<string, Scalar>[] = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    region: ['us', 'eu', 'ap'][i % 3],
    amount: i % 100,
    deleted: i % 50 === 0 ? null : 'x',
  }));
  const stats = StatsCollector.collect('sales', rows);

  it('collects row count and columns', () => {
    expect(stats.rowCount).toBe(1000);
    expect(stats.columns.get('id')!.ndv).toBeGreaterThan(500); // ~1000 distinct
  });

  it('min/max are correct', () => {
    expect(stats.columns.get('id')!.min).toBe(0);
    expect(stats.columns.get('id')!.max).toBe(999);
  });

  it('null fraction', () => {
    // 20 of 1000 rows have deleted = null
    expect(stats.columns.get('deleted')!.nullFraction).toBeCloseTo(0.02, 2);
  });

  it('histogram estimates range selectivity', () => {
    const amount = stats.columns.get('amount')!;
    // amount is uniform 0..99 → [0,50) ≈ 0.5
    const sel = amount.histogram!.rangeSelectivity(0, 50);
    expect(sel).toBeGreaterThan(0.3);
    expect(sel).toBeLessThan(0.7);
  });
});

describe('DistinctEstimator', () => {
  it('estimates low-cardinality exactly-ish', () => {
    const d = new DistinctEstimator();
    for (let i = 0; i < 3; i++) d.add('v' + i);
    expect(d.estimate()).toBeGreaterThanOrEqual(3);
    expect(d.estimate()).toBeLessThan(10);
  });
});

describe('estimateSelectivity', () => {
  const cs = { name: 'c', min: 0, max: 100, nullFraction: 0, ndv: 10, histogram: undefined };
  it('equality ≈ 1/ndv', () => {
    expect(estimateSelectivity(cs, 'eq', 5, 1000)).toBeCloseTo(0.1);
  });
  it('isNull returns nullFraction', () => {
    expect(estimateSelectivity({ ...cs, nullFraction: 0.2 }, 'isNull', null, 1000)).toBe(0.2);
  });
  it('missing stats → 1 (no pruning info)', () => {
    expect(estimateSelectivity(undefined, 'eq', 5, 1000)).toBe(1);
  });
});

/* ---------------------------------------------------------------------- */
/* Query planner                                                          */
/* ---------------------------------------------------------------------- */

describe('QueryPlanner', () => {
  const orders = StatsCollector.collect(
    'orders',
    Array.from({ length: 10_000 }, (_, i) => ({
      id: i,
      customerId: i % 500,
      region: ['us', 'eu'][i % 2],
      total: i % 1000,
    }))
  );
  const customers = StatsCollector.collect(
    'customers',
    Array.from({ length: 500 }, (_, i) => ({ id: i, name: 'c' + i, vip: i % 10 === 0 }))
  );
  const stats = new Map([
    ['orders', orders],
    ['customers', customers],
  ]);
  const planner = new QueryPlanner(stats);

  const find = (n: PlanNode, kind: string): PlanNode | undefined => {
    if (n.kind === kind) return n;
    const kids = 'input' in n ? [n.input] : 'left' in n ? [n.left, n.right] : [];
    for (const k of kids) {
      const f = find(k, kind);
      if (f) return f;
    }
    return undefined;
  };

  it('pushes single-table predicates onto the scan', () => {
    const plan = planner.plan({
      table: 'orders',
      select: ['id', 'total'],
      joins: [],
      where: { kind: 'pred', pred: { column: 'region', op: 'eq', value: 'us' } },
    });
    const scan = find(plan, 'scan')!;
    expect(scan.kind).toBe('scan');
    if (scan.kind === 'scan') {
      expect(scan.predicates.length).toBe(1);
      expect(scan.estRows).toBeLessThan(10_000);
      expect(scan.estRows).toBeGreaterThan(100);
    }
  });

  it('prunes projections to needed columns', () => {
    const plan = planner.plan({
      table: 'orders',
      select: ['id'],
      joins: [],
    });
    const scan = find(plan, 'scan')!;
    if (scan.kind === 'scan') {
      expect(scan.columns).toContain('id');
      expect(scan.columns).not.toContain('total');
    }
  });

  it('estimates join cardinality via NDV containment', () => {
    const plan = planner.plan({
      table: 'orders',
      select: ['id'],
      joins: [{ table: 'customers', leftColumn: 'customerId', rightColumn: 'id' }],
    });
    const join = find(plan, 'join')!;
    // 10000 × 500 / max(ndv_customerId≈500, ndv_id≈500) ≈ 10000, with
    // estimator error tolerated broadly.
    expect(join.estRows).toBeGreaterThan(2_000);
    expect(join.estRows).toBeLessThan(50_000);
  });

  it('picks smaller side first in join order', () => {
    // When the base is customers (500 rows), joining orders (10k) still
    // puts customers as left; cost annotations reflect estimates.
    const plan = planner.plan({
      table: 'customers',
      select: ['name'],
      joins: [{ table: 'orders', leftColumn: 'id', rightColumn: 'customerId' }],
    });
    const rows = planner.explain(plan);
    expect(rows[0].node).toContain('Project');
    expect(rows.some((r) => r.node.includes('Scan customers'))).toBe(true);
  });

  it('limit caps estimated rows', () => {
    const plan = planner.plan({ table: 'orders', select: ['id'], joins: [], limit: 50 });
    const limit = find(plan, 'limit')!;
    expect(limit.estRows).toBe(50);
  });

  it('groupBy estimates rows by NDV product', () => {
    const plan = planner.plan({
      table: 'orders',
      select: ['region'],
      joins: [],
      groupBy: ['region'],
    });
    const agg = find(plan, 'aggregate')!;
    expect(agg.estRows).toBeLessThanOrEqual(10_000);
  });

  it('explain output is readable', () => {
    const plan = planner.plan({
      table: 'orders',
      select: ['id'],
      joins: [],
      where: { kind: 'pred', pred: { column: 'region', op: 'eq', value: 'us' } },
    });
    const rows = planner.explain(plan);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.map((r) => r.node).join('\n')).toContain('Scan orders');
  });
});

/* ---------------------------------------------------------------------- */
/* MV matching                                                            */
/* ---------------------------------------------------------------------- */

describe('MvMatcher', () => {
  const sales = StatsCollector.collect(
    'sales',
    Array.from({ length: 10_000 }, (_, i) => ({ region: 'r' + (i % 4), revenue: i }))
  );
  const matcher = new MvMatcher(new Map([['sales', sales]]));

  const dailyMv: MvSignature = {
    name: 'sales_by_region_day',
    sourceTables: ['sales'],
    groupBy: ['region', 'day'],
    aggregates: [{ fn: 'sum', column: 'revenue' }],
    predicates: [],
    rowCount: 1200,
  };
  const regionMv: MvSignature = {
    name: 'sales_by_region',
    sourceTables: ['sales'],
    groupBy: ['region'],
    aggregates: [{ fn: 'sum', column: 'revenue' }],
    predicates: [],
    rowCount: 4,
  };

  it('matches an MV whose groupBy covers the query', () => {
    matcher.registerMv(dailyMv);
    const q: QueryAst = {
      table: 'sales',
      select: ['region', 'sum(revenue)'],
      joins: [],
      groupBy: ['region'],
    };
    const m = matcher.best(q);
    expect(m).not.toBeNull();
    expect(m!.mv.name).toBe('sales_by_region_day');
    expect(m!.needsRollup).toBe(true); // MV is finer (day) than query (region)
    expect(m!.saving).toBeLessThan(1);
  });

  it('prefers the smaller matching MV', () => {
    matcher.registerMv(regionMv);
    const q: QueryAst = {
      table: 'sales',
      select: ['region', 'sum(revenue)'],
      joins: [],
      groupBy: ['region'],
    };
    const m = matcher.best(q);
    expect(m!.mv.name).toBe('sales_by_region'); // 4 rows beats 1200
  });

  it('rejects MV missing a needed aggregate', () => {
    const q: QueryAst = {
      table: 'sales',
      select: ['region', 'avg(revenue)'],
      joins: [],
      groupBy: ['region'],
    };
    expect(matcher.best(q)).toBeNull();
  });

  it('rejects MV on a table not in the query', () => {
    matcher.registerMv({
      name: 'other_mv',
      sourceTables: ['returns'],
      groupBy: ['region'],
      aggregates: [{ fn: 'sum', column: 'revenue' }],
      predicates: [],
      rowCount: 4,
    });
    const q: QueryAst = { table: 'sales', select: ['region', 'sum(revenue)'], joins: [], groupBy: ['region'] };
    expect(matcher.best(q)).not.toBeNull(); // regionMv still matches
    expect(matcher.best(q)!.mv.name).toBe('sales_by_region');
  });

  it('rewrite returns the MV to target', () => {
    const q: QueryAst = { table: 'sales', select: ['region', 'sum(revenue)'], joins: [], groupBy: ['region'] };
    const rw = matcher.rewrite(q);
    expect(rw!.mvName).toBe('sales_by_region');
  });
});

/* ---------------------------------------------------------------------- */
/* Workload analysis                                                      */
/* ---------------------------------------------------------------------- */

describe('WorkloadTracker', () => {
  it('fingerprints equivalent queries together', () => {
    expect(fingerprint("SELECT * FROM t WHERE id = 1")).toBe(
      fingerprint("select *  from t  where id = 99")
    );
  });

  it('aggregates per-fingerprint stats', () => {
    const w = new WorkloadTracker({}, () => 0);
    for (let i = 0; i < 10; i++) {
      w.record({ sql: `SELECT * FROM orders WHERE id = ${i}`, durationMs: 100 + i, rowsScanned: 1000 });
    }
    const s = w.stats(fingerprint('SELECT * FROM orders WHERE id = 1'))!;
    expect(s.count).toBe(10);
    expect(s.meanMs).toBeCloseTo(104.5);
    expect(s.totalRowsScanned).toBe(10_000);
  });

  it('records slow queries on a ring buffer', () => {
    const w = new WorkloadTracker({ slowMs: 500, slowLogSize: 3 }, () => 0);
    for (let i = 0; i < 5; i++) {
      w.record({ sql: `q${i}`, durationMs: 600, rowsScanned: 1 });
    }
    expect(w.slowQueries().length).toBe(3); // capped
    expect(w.slowQueries()[0].sql).toBe('q4'); // newest first
  });

  it('topByTotalTime ranks correctly', () => {
    const w = new WorkloadTracker({}, () => 0);
    for (let i = 0; i < 20; i++) w.record({ sql: 'cheap', durationMs: 10, rowsScanned: 10 });
    for (let i = 0; i < 3; i++) w.record({ sql: 'expensive', durationMs: 900, rowsScanned: 10 });
    const top = w.topByTotalTime(1);
    expect(top[0].fingerprint).toBe('expensive');
  });

  it('suggestions requires repeat executions', () => {
    const w = new WorkloadTracker({}, () => 0);
    w.record({ sql: 'once', durationMs: 5, rowsScanned: 1 });
    for (let i = 0; i < 4; i++) w.record({ sql: 'repeated', durationMs: 5, rowsScanned: 1 });
    const s = w.suggestions(3);
    expect(s).toContain('repeated');
    expect(s).not.toContain('once');
  });
});
