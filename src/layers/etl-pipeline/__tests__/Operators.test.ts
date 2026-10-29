/**
 * ETL operators + lineage graph tests.
 */

import { describe, it, expect } from 'bun:test';
import {
  MemorySink,
  aggregateRows,
  arraySource,
  bulkLoader,
  dedupeRows,
  filterRows,
  flatMapRows,
  incrementalExtractor,
  joinBatches,
  mapRows,
  pagedExtractor,
  unionRows,
  upsertLoader,
  windowRows,
} from '../engine/Operators';
import { LineageGraph } from '../engine/LineageGraph';
import type { Row, RowBatch, StageContext } from '../engine/DagEngine';

const batch = (rows: Row[], origin = 't'): RowBatch => ({ rows, origin });

function ctx(watermark?: unknown): StageContext {
  return {
    pipelineId: 'p',
    stageId: 's',
    inputs: new Map(),
    watermark,
    attempt: 0,
    reportLineage: () => undefined,
    signal: new AbortController().signal,
  };
}

describe('extractors', () => {
  it('incrementalExtractor emits only rows above watermark and advances it', async () => {
    const src = arraySource([
      { id: 1, ts: 100 },
      { id: 2, ts: 200 },
      { id: 3, ts: 300 },
    ]);
    const c = ctx(150);
    const out = await incrementalExtractor(src, 'ts', c);
    expect(out.rows.map((r) => r.id)).toEqual([2, 3]);
    expect(c.watermark).toBe(300);
  });

  it('incrementalExtractor on fresh run emits everything', async () => {
    const src = arraySource([{ id: 1, ts: 5 }]);
    const out = await incrementalExtractor(src, 'ts', ctx());
    expect(out.rows.length).toBe(1);
  });

  it('pagedExtractor follows cursors', async () => {
    const src = arraySource(Array.from({ length: 25 }, (_, i) => ({ id: i })));
    const out = await pagedExtractor(src, 10, ctx());
    expect(out.rows.length).toBe(25);
  });
});

describe('transformers', () => {
  const rows = batch([{ a: 1, b: 'x' }, { a: 2, b: 'y' }, { a: 3, b: 'x' }]);

  it('map/filter/flatMap', () => {
    expect(mapRows(rows, (r) => ({ ...r, c: 1 }), 'm').rows[0].c).toBe(1);
    expect(filterRows(rows, (r) => r.b === 'x', 'f').rows.length).toBe(2);
    expect(flatMapRows(rows, (r) => [{ v: r.a }, { v: (r.a as number) * 10 }], 'fm').rows.length).toBe(6);
  });

  it('joinBatches inner join', () => {
    const left = batch([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
    const right = batch([{ rid: 2, w: 'x' }, { rid: 3, w: 'y' }]);
    const out = joinBatches(left, right, (l) => l.id, (r) => r.rid, 'inner', (l, r) => ({ ...l, ...r }), 'j');
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].w).toBe('x');
  });

  it('joinBatches left join keeps unmatched', () => {
    const left = batch([{ id: 1 }, { id: 2 }]);
    const right = batch([{ rid: 2, w: 'x' }]);
    const out = joinBatches(left, right, (l) => l.id, (r) => r.rid, 'left', (l, r) => ({ id: l?.id, w: r?.w ?? null }), 'j');
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].w).toBeNull();
  });

  it('joinBatches full outer', () => {
    const left = batch([{ id: 1 }]);
    const right = batch([{ rid: 9 }]);
    const out = joinBatches(left, right, (l) => l.id, (r) => r.rid, 'full', (l, r) => ({ l: l?.id ?? null, r: r?.rid ?? null }), 'j');
    expect(out.rows.length).toBe(2);
  });

  it('aggregateRows groups and folds', () => {
    const out = aggregateRows(
      rows,
      (r) => r.b,
      () => ({ n: 0 }),
      (acc) => { acc.n++; },
      (k, acc) => ({ b: k, n: acc.n }),
      'agg'
    );
    expect(out.rows.length).toBe(2);
    const x = out.rows.find((r) => r.b === 'x');
    expect(x?.n).toBe(2);
  });

  it('windowRows computes running totals per partition', () => {
    const b = batch([{ p: 'a', v: 1 }, { p: 'a', v: 2 }, { p: 'a', v: 3 }, { p: 'b', v: 10 }]);
    const out = windowRows(
      b,
      (r) => r.p,
      (x, y) => (x.v as number) - (y.v as number),
      Infinity, 0,
      () => ({ sum: 0 }),
      (acc, r) => { acc.sum += r.v as number; },
      (row, acc) => ({ ...row, running: acc.sum }),
      'w'
    );
    const aRows = out.rows.filter((r) => r.p === 'a');
    expect(aRows.map((r) => r.running)).toEqual([1, 3, 6]);
    const bRow = out.rows.find((r) => r.p === 'b');
    expect(bRow?.running).toBe(10);
  });

  it('dedupeRows first-wins', () => {
    const b = batch([{ k: 1, v: 'first' }, { k: 1, v: 'second' }, { k: 2, v: 'x' }]);
    const out = dedupeRows(b, (r) => r.k, 'd');
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].v).toBe('first');
  });

  it('unionRows concatenates', () => {
    const out = unionRows([batch([{ a: 1 }]), batch([{ a: 2 }])], 'u');
    expect(out.rows.length).toBe(2);
  });
});

describe('loaders', () => {
  it('bulkLoader chunks writes', async () => {
    const sink = new MemorySink();
    const b = batch(Array.from({ length: 1200 }, (_, i) => ({ id: i })));
    const res = await bulkLoader(b, sink, 500);
    expect(res.written).toBe(1200);
    expect(sink.rows.length).toBe(1200);
  });

  it('upsertLoader updates existing keys, inserts new', async () => {
    const sink = new MemorySink((r) => r.id);
    await sink.write([{ id: 1, v: 'old' }]);
    const b = batch([{ id: 1, v: 'new' }, { id: 2, v: 'fresh' }]);
    const res = await upsertLoader(b, sink, (r) => r.id);
    expect(res.updated).toBe(1);
    expect(res.inserted).toBe(1);
    expect(sink.getByKey(1)?.v).toBe('new');
    expect(sink.getByKey(2)?.v).toBe('fresh');
  });

  it('upsertLoader throws for incapable sink', async () => {
    const res = upsertLoader(batch([{ id: 1 }]), { write: () => 1 }, (r) => r.id);
    await expect(res).rejects.toThrow('upsert');
  });
});

describe('LineageGraph', () => {
  it('upstream/downstream closures', () => {
    const g = new LineageGraph();
    g.addAll([
      { from: 'source.a', to: 'stg.a', transform: 'e' },
      { from: 'stg.a', to: 'mart.a', transform: 't' },
      { from: 'stg.a', to: 'mart.b', transform: 't2' },
    ]);
    expect(g.upstream('mart.a').sort()).toEqual(['source.a', 'stg.a']);
    expect(g.downstream('stg.a').sort()).toEqual(['mart.a', 'mart.b']);
  });

  it('paths enumerates derivations', () => {
    const g = new LineageGraph();
    g.addAll([
      { from: 'a', to: 'b', transform: '1' },
      { from: 'b', to: 'c', transform: '2' },
      { from: 'a', to: 'c', transform: '3' },
    ]);
    const p = g.paths('a', 'c');
    expect(p.length).toBe(2);
  });

  it('hasCycle detects cycles', () => {
    const g = new LineageGraph();
    g.addAll([
      { from: 'a', to: 'b', transform: '' },
      { from: 'b', to: 'a', transform: '' },
    ]);
    expect(g.hasCycle()).toBe(true);
  });

  it('serializes round-trip', () => {
    const g = new LineageGraph();
    g.addAll([{ from: 'x', to: 'y', transform: 't' }]);
    const restored = LineageGraph.fromJSON(g.toJSON());
    expect(restored.edges.length).toBe(1);
    expect(restored.downstream('x')).toEqual(['y']);
  });
});
