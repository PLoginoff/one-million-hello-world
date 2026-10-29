/**
 * Bitmap index tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { BitmapIndex, BitmapIndexSet, RawBitmap } from '../engine/BitmapIndex';
import { ColumnarTable } from '../engine/ColumnStorageEngine';
import type { ColumnSchema } from '../engine/ColumnStorageEngine';

describe('RawBitmap', () => {
  it('set/get/cardinality', () => {
    const b = new RawBitmap(100);
    b.set(0);
    b.set(31);
    b.set(32);
    b.set(99);
    expect(b.get(0)).toBe(true);
    expect(b.get(1)).toBe(false);
    expect(b.get(99)).toBe(true);
    expect(b.cardinality()).toBe(4);
  });

  it('or/and/andNot', () => {
    const a = new RawBitmap(64);
    const b = new RawBitmap(64);
    a.set(1); a.set(2); a.set(3);
    b.set(2); b.set(3); b.set(4);
    const or = RawBitmap.or(a, b);
    expect(or.cardinality()).toBe(4);
    const and = RawBitmap.and(a, b);
    expect(and.toArray()).toEqual([2, 3]);
    const an = a.clone(); an.andNot(b);
    expect(an.toArray()).toEqual([1]);
  });
});

describe('BitmapIndex', () => {
  const SCHEMA: ColumnSchema[] = [
    { name: 'region', type: 'string', nullable: false },
    { name: 'tier', type: 'string', nullable: true },
    { name: 'amount', type: 'float64', nullable: false },
  ];
  let table: ColumnarTable;

  beforeEach(() => {
    table = new ColumnarTable('t', SCHEMA, { chunkSize: 100 });
    const regions = ['us', 'eu', 'ap'];
    const tiers = ['gold', 'silver', null];
    for (let i = 0; i < 300; i++) {
      table.appendRow({ region: regions[i % 3], tier: tiers[i % 3], amount: i });
    }
  });

  it('eq returns matching row ids', () => {
    const idx = BitmapIndex.build(table, 'region');
    const ids = idx.eq('us');
    expect(ids.length).toBe(100);
    for (const id of ids) expect(id % 3).toBe(0);
  });

  it('eq on null finds null bitmap', () => {
    const idx = BitmapIndex.build(table, 'tier');
    const ids = idx.eq(null);
    expect(ids.length).toBe(100); // every 3rd row has null tier
  });

  it('in unions value bitmaps', () => {
    const idx = BitmapIndex.build(table, 'region');
    const ids = idx.in(['us', 'eu']);
    expect(ids.length).toBe(200);
  });

  it('range uses sorted domain slice', () => {
    const idx = BitmapIndex.build(table, 'amount');
    const ids = idx.range(100, 199);
    expect(ids.length).toBe(100);
    expect(Math.min(...ids)).toBe(100);
    expect(Math.max(...ids)).toBe(199);
  });

  it('range with open bounds', () => {
    const idx = BitmapIndex.build(table, 'amount');
    expect(idx.range(null, 9).length).toBe(10);
    expect(idx.range(290, null).length).toBe(10);
  });

  it('adviseIndexable heuristics', () => {
    expect(BitmapIndex.adviseIndexable(10000, 50).advisable).toBe(true);
    expect(BitmapIndex.adviseIndexable(10000, 9000).advisable).toBe(false);
  });

  it('byteSize grows with cardinality', () => {
    const regionIdx = BitmapIndex.build(table, 'region'); // 3 values
    const amountIdx = BitmapIndex.build(table, 'amount'); // 300 values
    expect(regionIdx.byteSize()).toBeLessThan(amountIdx.byteSize());
  });
});

describe('BitmapIndexSet', () => {
  it('conjunctive lookup ANDs bitmaps', () => {
    const SCHEMA: ColumnSchema[] = [
      { name: 'region', type: 'string', nullable: false },
      { name: 'tier', type: 'string', nullable: true },
    ];
    const table = new ColumnarTable('t', SCHEMA, { chunkSize: 100 });
    const regions = ['us', 'eu', 'ap'];
    const tiers = ['gold', 'silver'];
    for (let i = 0; i < 300; i++) {
      table.appendRow({ region: regions[i % 3], tier: i % 4 === 0 ? null : tiers[i % 2] });
    }
    const set = new BitmapIndexSet(table);
    set.buildIndex('region');
    set.buildIndex('tier');
    const ids = set.lookup({ region: 'us', tier: 'gold' });
    for (const id of ids) {
      const r = table.rowAt(id);
      expect(r.region).toBe('us');
      expect(r.tier).toBe('gold');
    }
    expect(ids.length).toBeGreaterThan(0);
  });
});
