/**
 * Reporting engine — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { DatasetStore } from '../reports/DatasetStore';
import { QueryPipeline, bucketStart, bucketRows, compareCells } from '../reports/QueryPipeline';
import { PivotTable } from '../reports/PivotTable';
import { CronExpression } from '../reports/CronSchedule';
import { ReportExporter } from '../reports/ReportExporter';
import { ReportEngine } from '../reports/ReportEngine';
import { Clock, ReportError, Row } from '../reports/ReportTypes';

function fakeClock(start = Date.UTC(2024, 0, 1)): Clock & { advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

function makeStore(): DatasetStore {
  const s = new DatasetStore();
  s.define('sales', [
    { name: 'region', type: 'string' },
    { name: 'quarter', type: 'string' },
    { name: 'revenue', type: 'number' },
    { name: 'units', type: 'number' },
    { name: 'sold_at', type: 'date' },
  ]);
  return s;
}

const ROWS: Row[] = [
  { region: 'us', quarter: 'q1', revenue: 100, units: 10, sold_at: new Date(Date.UTC(2024, 0, 15)) },
  { region: 'us', quarter: 'q2', revenue: 200, units: 20, sold_at: new Date(Date.UTC(2024, 3, 15)) },
  { region: 'eu', quarter: 'q1', revenue: 150, units: 15, sold_at: new Date(Date.UTC(2024, 0, 20)) },
  { region: 'eu', quarter: 'q2', revenue: 250, units: 25, sold_at: new Date(Date.UTC(2024, 4, 10)) },
  { region: 'us', quarter: 'q1', revenue: 50, units: 5, sold_at: new Date(Date.UTC(2024, 1, 5)) },
];

// ------------------------------------------------------------- DatasetStore

describe('DatasetStore', () => {
  it('validates column types on insert', () => {
    const s = makeStore();
    expect(() => s.insert('sales', { region: 'us', revenue: 'x' })).toThrow(ReportError);
    expect(() => s.insert('sales', { bogus: 1 })).toThrow(ReportError);
    s.insert('sales', { region: 'us' }); // missing cols → null
    expect(s.get('sales')!.rows[0].revenue).toBeNull();
  });
});

// ------------------------------------------------------------- QueryPipeline

describe('QueryPipeline', () => {
  let pipe: QueryPipeline;
  beforeEach(() => {
    const s = makeStore();
    s.insertAll('sales', ROWS);
    pipe = new QueryPipeline(s, fakeClock(0));
  });

  it('filters rows', () => {
    const r = pipe.run({
      dataset: 'sales',
      filters: [{ column: 'region', op: 'eq', value: 'us' }],
    });
    expect(r.rows).toHaveLength(3);
    const r2 = pipe.run({
      dataset: 'sales',
      filters: [
        { column: 'revenue', op: 'gte', value: 150 },
        { column: 'quarter', op: 'in', value: ['q2'] },
      ],
    });
    expect(r2.rows.map((x) => x.revenue)).toEqual([200, 250]);
  });

  it('groups + aggregates', () => {
    const r = pipe.run({
      dataset: 'sales',
      groupBy: ['region'],
      aggregates: [
        { column: 'revenue', fn: 'sum', as: 'total' },
        { column: 'revenue', fn: 'avg', as: 'mean' },
        { column: null, fn: 'count', as: 'n' },
      ],
      orderBy: 'total',
      orderDesc: true,
    });
    expect(r.columns).toEqual(['region', 'total', 'mean', 'n']);
    expect(r.rows[0].region).toBe('eu');
    expect(r.rows[0].total).toBe(400);
    expect(r.rows[0].n).toBe(2);
    expect(r.rows[1].total).toBe(350);
    expect(r.rows[1].mean).toBeCloseTo(350 / 3);
  });

  it('global aggregates produce a single row', () => {
    const r = pipe.run({
      dataset: 'sales',
      aggregates: [{ column: 'revenue', fn: 'sum', as: 'total' }],
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].total).toBe(750);
  });

  it('between + contains + ordering + limit', () => {
    const r = pipe.run({
      dataset: 'sales',
      filters: [{ column: 'revenue', op: 'between', value: [100, 200] }],
      orderBy: 'revenue',
      orderDesc: true,
      limit: 2,
    });
    expect(r.rows.map((x) => x.revenue)).toEqual([200, 150]);
  });

  it('incremental watermark filters to newer rows', () => {
    const r = pipe.run(
      { dataset: 'sales', incrementalColumn: 'sold_at' },
      new Date(Date.UTC(2024, 2, 1))
    );
    expect(r.rows).toHaveLength(2); // only q2 rows are after Mar 1
  });

  it('compareCells orders nulls first, mixed types by rank', () => {
    expect(compareCells(null, 1)).toBe(-1);
    expect(compareCells(2, 10)).toBeLessThan(0);
    expect(compareCells('b', 'a')).toBeGreaterThan(0);
    expect(compareCells(new Date(5), new Date(3))).toBeGreaterThan(0);
    expect(compareCells(1, 'a')).toBeLessThan(0); // number < string by rank
  });
});

// ------------------------------------------------------------- Bucketing

describe('time bucketing', () => {
  it('buckets by hour/day/week/month (UTC)', () => {
    const t = Date.UTC(2024, 0, 17, 15, 30); // Wed Jan 17 15:30
    expect(bucketStart(t, 'hour')).toBe(Date.UTC(2024, 0, 17, 15));
    expect(bucketStart(t, 'day')).toBe(Date.UTC(2024, 0, 17));
    expect(bucketStart(t, 'week')).toBe(Date.UTC(2024, 0, 15)); // Monday
    expect(bucketStart(t, 'month')).toBe(Date.UTC(2024, 0, 1));
  });

  it('bucketRows groups and sorts buckets', () => {
    const rows: Row[] = [
      { ts: new Date(Date.UTC(2024, 0, 2)), v: 1 },
      { ts: new Date(Date.UTC(2024, 0, 1)), v: 2 },
      { ts: new Date(Date.UTC(2024, 0, 1, 12)), v: 3 },
    ];
    const b = bucketRows(rows, 'ts', 'day');
    expect(b).toHaveLength(2);
    expect(b[0].bucket).toBe(Date.UTC(2024, 0, 1));
    expect(b[0].rows).toHaveLength(2);
  });
});

// ------------------------------------------------------------- Pivot

describe('PivotTable', () => {
  it('pivots row-dimension × column-dimension with sum', () => {
    const p = new PivotTable();
    const result = p.build(ROWS, {
      rowDimension: 'region',
      column: 'quarter',
      value: { column: 'revenue', fn: 'sum', as: 'v' },
      fill: 0,
    }, 0);
    expect(result.columns).toEqual(['region', 'q1', 'q2']);
    const us = result.rows.find((r) => r.region === 'us')!;
    const eu = result.rows.find((r) => r.region === 'eu')!;
    expect(us.q1).toBe(150); // 100 + 50
    expect(us.q2).toBe(200);
    expect(eu.q1).toBe(150);
    expect(eu.q2).toBe(250);
  });

  it('fills empty cells', () => {
    const p = new PivotTable();
    const rows: Row[] = [{ a: 'x', p: 'only', v: 5 }];
    const r = p.build(rows, {
      rowDimension: 'a', column: 'p',
      value: { column: 'v', fn: 'count', as: 'c' }, fill: 0,
    }, 0);
    expect(r.rows[0].only).toBe(1);
  });
});

// ------------------------------------------------------------- Cron

describe('CronExpression', () => {
  const T0 = Date.UTC(2024, 0, 1, 0, 0); // Mon Jan 1 2024 00:00

  it('parses wildcard + steps + lists + ranges', () => {
    const every5 = new CronExpression('*/5 * * * *');
    expect(every5.next(T0)).toBe(T0 + 5 * 60_000);
    const list = new CronExpression('0 9,17 * * *');
    expect(list.next(T0)).toBe(Date.UTC(2024, 0, 1, 9));
    const range = new CronExpression('0 9-17 * * *');
    expect(range.next(Date.UTC(2024, 0, 1, 10))).toBe(Date.UTC(2024, 0, 1, 11));
  });

  it('dom/dow OR semantics when both restricted', () => {
    // 15th of month OR Monday
    const c = new CronExpression('0 0 15 * 1');
    // Jan 8 2024 is a Monday (not the 15th)
    expect(c.next(Date.UTC(2024, 0, 7))).toBe(Date.UTC(2024, 0, 8));
    // Jan 15 is the 15th AND a Monday
    expect(c.next(Date.UTC(2024, 0, 8, 0, 1))).toBe(Date.UTC(2024, 0, 15));
  });

  it('skips months and finds distant runs', () => {
    const yearly = new CronExpression('0 0 1 1 *'); // Jan 1 midnight
    expect(yearly.next(Date.UTC(2024, 5, 1))).toBe(Date.UTC(2025, 0, 1));
  });

  it('rejects invalid expressions', () => {
    expect(() => new CronExpression('* * *')).toThrow(ReportError);
    expect(() => new CronExpression('99 * * * *')).toThrow(ReportError);
    expect(() => new CronExpression('*/0 * * * *')).toThrow(ReportError);
  });

  it('nextN enumerates future runs', () => {
    const c = new CronExpression('0 12 * * *');
    const runs = c.nextN(T0, 3);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toBe(Date.UTC(2024, 0, 1, 12));
    expect(runs[1]).toBe(Date.UTC(2024, 0, 2, 12));
  });
});

// ------------------------------------------------------------- Export

describe('ReportExporter', () => {
  const exp = new ReportExporter();

  it('CSV escapes commas, quotes, newlines', () => {
    const out = exp.toCsv({
      columns: ['a', 'b'],
      rows: [
        { a: 'x,y', b: 'say "hi"' },
        { a: 'line\nbreak', b: null },
      ],
      generatedAt: 0,
    });
    const lines = out.trim().split('\r\n');
    expect(lines[0]).toBe('a,b');
    expect(lines[1]).toBe('"x,y","say ""hi"""');
    // newline inside field stays embedded in the quoted field → 3 lines
    expect(lines.length).toBe(3);
    expect(lines[2]).toBe('"line\nbreak",');
  });

  it('Dates export as ISO, null as empty', () => {
    const out = exp.toCsv({
      columns: ['d', 'n'],
      rows: [{ d: new Date(Date.UTC(2024, 0, 1)), n: null }],
      generatedAt: 0,
    });
    expect(out).toContain('2024-01-01T00:00:00.000Z,');
  });

  it('JSON round-trips rows', () => {
    const out = exp.toJson({
      columns: ['a', 'b'],
      rows: [{ a: 1, b: 'x' }],
      generatedAt: 0,
    });
    const parsed = JSON.parse(out);
    expect(parsed.columns).toEqual(['a', 'b']);
    expect(parsed.rows[0].a).toBe(1);
  });
});

// ------------------------------------------------------------- ReportEngine

describe('ReportEngine', () => {
  let clock: ReturnType<typeof fakeClock>;
  let engine: ReportEngine;
  beforeEach(() => {
    clock = fakeClock(Date.UTC(2024, 0, 1));
    engine = new ReportEngine(clock);
    engine.defineDataset('sales', [
      { name: 'region', type: 'string' },
      { name: 'quarter', type: 'string' },
      { name: 'revenue', type: 'number' },
      { name: 'units', type: 'number' },
      { name: 'sold_at', type: 'date' },
    ]);
  });

  it('runs ad-hoc and pivot queries', () => {
    engine.insertRows('sales', ROWS);
    const r = engine.run({
      dataset: 'sales', groupBy: ['region'],
      aggregates: [{ column: 'revenue', fn: 'sum', as: 't' }],
    });
    expect(r.rows).toHaveLength(2);
    const p = engine.run({
      dataset: 'sales',
      pivot: { rowDimension: 'region', column: 'quarter', value: { column: 'revenue', fn: 'sum', as: 'v' } },
    });
    expect(p.columns).toEqual(['region', 'q1', 'q2']);
  });

  it('scheduled report fires on cron and records run history', () => {
    engine.insertRows('sales', ROWS);
    engine.schedule({
      scheduleId: 'daily', cron: '0 0 * * *',
      query: { dataset: 'sales', aggregates: [{ column: 'revenue', fn: 'sum', as: 't' }] },
    });
    // next fire is Jan 2 00:00
    clock.advance(24 * 3600_000 + 1);
    const runs = engine.runDue();
    expect(runs).toHaveLength(1);
    expect(runs[0].rowCount).toBe(1);
    expect(engine.runHistory('daily')).toHaveLength(1);
  });

  it('incremental runs only process new rows', () => {
    engine.insertRows('sales', ROWS.slice(0, 2));
    engine.schedule({
      scheduleId: 'inc', cron: '* * * * *', incremental: true,
      query: { dataset: 'sales', incrementalColumn: 'sold_at', aggregates: [{ column: null, fn: 'count', as: 'n' }] },
    });
    const r1 = engine.runOnce('inc');
    expect(r1.rowCount).toBe(1); // aggregate → 1 row out (count=2 rows in)
    // no new rows → count over empty set = 0
    const r2 = engine.runOnce('inc');
    expect(r2.watermark).not.toBeNull();
    // add a newer row, run again
    engine.insertRows('sales', [{ region: 'ap', revenue: 9, sold_at: new Date(Date.UTC(2024, 11, 1)) }]);
    const r3 = engine.runOnce('inc');
    expect(r3.watermark).toEqual(new Date(Date.UTC(2024, 11, 1)));
  });

  it('exports scheduled query results', () => {
    engine.insertRows('sales', ROWS);
    engine.schedule({
      scheduleId: 's', cron: '* * * * *',
      query: { dataset: 'sales', filters: [{ column: 'region', op: 'eq', value: 'us' }] },
    });
    const csv = engine.runAndExport('s', 'csv');
    expect(csv.split('\r\n')[0]).toBe('region,quarter,revenue,units,sold_at');
  });
});
