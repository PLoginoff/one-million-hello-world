/**
 * Star schema, partition pruning, and materialized view tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { StarSchema } from '../engine/StarSchemaBuilder';
import { ColumnarTable } from '../engine/ColumnStorageEngine';
import { MaterializedView, MaterializedViewCatalog, PartitionPruner } from '../engine/MaterializedView';
import type { DimensionSpec, FactSpec } from '../engine/StarSchemaBuilder';
import type { ColumnSchema, Row } from '../engine/ColumnStorageEngine';

const DIMS: DimensionSpec[] = [
  {
    name: 'customer',
    naturalKey: ['email'],
    attributes: [
      { name: 'name', type: 'string', nullable: false },
      { name: 'tier', type: 'string', nullable: false },
    ],
    scd: 'type2',
  },
  {
    name: 'product',
    naturalKey: ['sku'],
    attributes: [
      { name: 'title', type: 'string', nullable: false },
      { name: 'category', type: 'string', nullable: false },
    ],
    scd: 'type1',
  },
];

const FACT: FactSpec = {
  name: 'sales',
  measures: [
    { name: 'amount', type: 'float64', nullable: false },
    { name: 'qty', type: 'int32', nullable: false },
  ],
  degenerateDimensions: [{ name: 'order_no', type: 'string', nullable: false }],
};

describe('DimensionTable', () => {
  let star: StarSchema;
  beforeEach(() => {
    star = new StarSchema(FACT, DIMS);
  });

  it('assigns surrogate keys on insert', () => {
    const r1 = star.dimension('customer').upsert({ email: 'a@x.com', name: 'Ann', tier: 'gold' });
    const r2 = star.dimension('customer').upsert({ email: 'b@x.com', name: 'Bob', tier: 'silver' });
    expect(r1.action).toBe('inserted');
    expect(r2.action).toBe('inserted');
    expect(r2.surrogateKey).toBeGreaterThan(r1.surrogateKey);
  });

  it('SCD2 opens new version on attribute change', () => {
    const dim = star.dimension('customer');
    dim.upsert({ email: 'a@x.com', name: 'Ann', tier: 'gold' }, 1000);
    const v2 = dim.upsert({ email: 'a@x.com', name: 'Ann', tier: 'platinum' }, 2000);
    expect(v2.action).toBe('newVersion');
    const history = dim.history({ email: 'a@x.com' });
    expect(history.length).toBe(2);
    const current = dim.currentRows();
    expect(current.length).toBe(1);
    expect(current[0].tier).toBe('platinum');
  });

  it('SCD2 unchanged member is a no-op', () => {
    const dim = star.dimension('customer');
    const r1 = dim.upsert({ email: 'a@x.com', name: 'Ann', tier: 'gold' });
    const r2 = dim.upsert({ email: 'a@x.com', name: 'Ann', tier: 'gold' });
    expect(r2.action).toBe('unchanged');
    expect(r2.surrogateKey).toBe(r1.surrogateKey);
  });

  it('SCD1 keeps one version', () => {
    const dim = star.dimension('product');
    dim.upsert({ sku: 'P1', title: 'Widget', category: 'tools' });
    const r = dim.upsert({ sku: 'P1', title: 'Super Widget', category: 'tools' });
    expect(r.action).toBe('updated');
    expect(dim.currentRows().length).toBe(1);
    expect(dim.currentRows()[0].title).toBe('Super Widget');
  });

  it('asOf returns historical versions', () => {
    const dim = star.dimension('customer');
    dim.upsert({ email: 'a@x.com', name: 'Ann', tier: 'gold' }, 1000);
    dim.upsert({ email: 'a@x.com', name: 'Ann', tier: 'platinum' }, 2000);
    const at1500 = dim.asOf(1500);
    expect(at1500.length).toBe(1);
    expect(at1500[0].tier).toBe('gold');
    const at2500 = dim.asOf(2500);
    expect(at2500[0].tier).toBe('platinum');
  });
});

describe('StarSchema — starJoin', () => {
  let star: StarSchema;
  beforeEach(() => {
    star = new StarSchema(FACT, DIMS);
    const c1 = star.dimension('customer').upsert({ email: 'a@x.com', name: 'Ann', tier: 'gold' }).surrogateKey;
    const c2 = star.dimension('customer').upsert({ email: 'b@x.com', name: 'Bob', tier: 'silver' }).surrogateKey;
    const p1 = star.dimension('product').upsert({ sku: 'P1', title: 'Widget', category: 'tools' }).surrogateKey;
    const p2 = star.dimension('product').upsert({ sku: 'P2', title: 'Gadget', category: 'electronics' }).surrogateKey;
    star.fact.addFact({ amount: 100, qty: 1 }, { customer: c1, product: p1 }, { order_no: 'O1' });
    star.fact.addFact({ amount: 200, qty: 2 }, { customer: c1, product: p2 }, { order_no: 'O2' });
    star.fact.addFact({ amount: 300, qty: 3 }, { customer: c2, product: p2 }, { order_no: 'O3' });
  });

  it('joins facts with dimension attributes', () => {
    const rows = star.starJoin();
    expect(rows.length).toBe(3);
    expect(rows[0]['customer.name']).toBe('Ann');
    expect(rows[0]['sales.amount']).toBe(100);
  });

  it('dimension filter restricts join output', () => {
    const rows = star.starJoin({ dimensionFilters: { product: { category: 'electronics' } } });
    expect(rows.length).toBe(2); // only P2 facts
    for (const r of rows) expect(r['product.category']).toBe('electronics');
  });

  it('combined filters on multiple dimensions', () => {
    const rows = star.starJoin({
      dimensionFilters: { product: { category: 'electronics' }, customer: { tier: 'silver' } },
    });
    expect(rows.length).toBe(1);
    expect(rows[0]['sales.amount']).toBe(300);
  });

  it('fact predicate filters measures', () => {
    const rows = star.starJoin({ factPredicates: [{ column: 'amount', op: 'gt', value: 150 }] });
    expect(rows.length).toBe(2);
  });
});

describe('PartitionPruner', () => {
  it('prunes groups outside predicate range', () => {
    const schema: ColumnSchema[] = [{ name: 'day', type: 'string', nullable: false }];
    const t = new ColumnarTable('p', schema, { chunkSize: 10 });
    // 3 chunks: days 01-10, 11-20, 21-30 as strings '01'..'30'
    for (let i = 1; i <= 30; i++) t.appendRow({ day: String(i).padStart(2, '0') });
    const pruner = new PartitionPruner();
    const res = pruner.prune(t, { kind: 'predicate', pred: { column: 'day', op: 'lt', value: '05' } });
    expect(res.surviving).toEqual([0]);
    expect(res.pruned).toEqual([1, 2]);
  });

  it('OR tree keeps union of matching groups', () => {
    const schema: ColumnSchema[] = [{ name: 'v', type: 'int64', nullable: false }];
    const t = new ColumnarTable('p', schema, { chunkSize: 10 });
    for (let i = 0; i < 30; i++) t.appendRow({ v: i });
    const pruner = new PartitionPruner();
    const res = pruner.prune(t, {
      kind: 'or',
      children: [
        { kind: 'predicate', pred: { column: 'v', op: 'lt', value: 5 } },
        { kind: 'predicate', pred: { column: 'v', op: 'gte', value: 25 } },
      ],
    });
    expect(res.surviving).toEqual([0, 2]);
    expect(res.pruned).toEqual([1]);
  });

  it('AND tree requires all children', () => {
    const schema: ColumnSchema[] = [
      { name: 'a', type: 'int64', nullable: false },
      { name: 'b', type: 'int64', nullable: false },
    ];
    const t = new ColumnarTable('p', schema, { chunkSize: 10 });
    for (let i = 0; i < 20; i++) t.appendRow({ a: i, b: i < 10 ? 0 : 100 });
    const pruner = new PartitionPruner();
    const res = pruner.prune(t, {
      kind: 'and',
      children: [
        { kind: 'predicate', pred: { column: 'a', op: 'lt', value: 15 } },
        { kind: 'predicate', pred: { column: 'b', op: 'eq', value: 100 } },
      ],
    });
    // chunk0: a ok but b max=0 <100 → pruned; chunk1: a 10-19 overlaps <15, b=100 → survives
    expect(res.surviving).toEqual([1]);
    expect(res.pruned).toEqual([0]);
  });
});

describe('MaterializedView', () => {
  const rows: Row[] = [
    { region: 'us', amount: 10 },
    { region: 'us', amount: 20 },
    { region: 'eu', amount: 30 },
  ];

  it('full refresh computes aggregates', () => {
    const mv = new MaterializedView({
      name: 'v',
      groupBy: ['region'],
      aggregates: [{ fn: 'sum', column: 'amount', alias: 'total' }],
      strategy: 'full',
    });
    mv.refresh(rows);
    const out = mv.rows();
    expect(out.length).toBe(2);
    const us = out.find((r) => r.region === 'us');
    expect(us?.total).toBe(30);
  });

  it('incremental refresh merges delta only', () => {
    const mv = new MaterializedView({
      name: 'v',
      groupBy: ['region'],
      aggregates: [{ fn: 'sum', column: 'amount', alias: 'total' }, { fn: 'count', alias: 'n' }],
      strategy: 'incremental',
    });
    mv.refresh(rows);
    mv.notifyAppend([{ region: 'us', amount: 5 }, { region: 'ap', amount: 7 }]);
    mv.refresh(rows); // full row list passed; incremental uses only delta
    const out = mv.rows();
    const us = out.find((r) => r.region === 'us');
    const ap = out.find((r) => r.region === 'ap');
    expect(us?.total).toBe(35);
    expect(us?.n).toBe(3);
    expect(ap?.total).toBe(7);
  });

  it('lazy view recomputes on read when dirty', () => {
    const mv = new MaterializedView({
      name: 'v',
      groupBy: ['region'],
      aggregates: [{ fn: 'count', alias: 'n' }],
      strategy: 'lazy',
    });
    const out = mv.rows(rows); // dirty → recompute from sourceRows
    expect(out.length).toBe(2);
  });

  it('catalog wires sources to views', () => {
    const cat = new MaterializedViewCatalog();
    cat.registerSource('sales', rows);
    cat.createView('sales', {
      name: 'by_region',
      groupBy: ['region'],
      aggregates: [{ fn: 'sum', column: 'amount', alias: 't' }],
      strategy: 'full',
    });
    const report = cat.refreshAll();
    expect(report[0].view).toBe('by_region');
    cat.appendToSource('sales', [{ region: 'us', amount: 40 }]);
    cat.refreshAll();
    const us = cat.view('by_region').rows().find((r) => r.region === 'us');
    expect(us?.t).toBe(70);
  });
});
