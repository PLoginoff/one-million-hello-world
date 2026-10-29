/**
 * Columnar storage engine tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  BitVector,
  ColumnarTable,
  compareScalars,
  evalPredicate,
} from '../engine/ColumnStorageEngine';
import type { ColumnSchema, Row } from '../engine/ColumnStorageEngine';

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'int64', nullable: false },
  { name: 'region', type: 'string', nullable: false },
  { name: 'amount', type: 'float64', nullable: true },
  { name: 'active', type: 'boolean', nullable: false },
];

function makeRows(n: number, region: (i: number) => string = (i) => `r${i % 4}`): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({ id: i, region: region(i), amount: i * 1.5, active: i % 2 === 0 });
  }
  return rows;
}

describe('BitVector', () => {
  it('push/get round-trips bits', () => {
    const bv = new BitVector(4);
    bv.push(true);
    bv.push(false);
    bv.push(true);
    bv.push(false);
    bv.push(true); // crosses initial capacity 4→? (capacity was 64 anyway)
    expect(bv.get(0)).toBe(true);
    expect(bv.get(1)).toBe(false);
    expect(bv.get(4)).toBe(true);
    expect(bv.length).toBe(5);
  });

  it('popcount counts set bits', () => {
    const bv = new BitVector();
    for (let i = 0; i < 100; i++) bv.push(i % 3 === 0);
    expect(bv.popcount()).toBe(34);
  });

  it('grows beyond initial capacity', () => {
    const bv = new BitVector(8);
    for (let i = 0; i < 200; i++) bv.push(i % 2 === 0);
    expect(bv.length).toBe(200);
    expect(bv.get(199)).toBe(false);
    expect(bv.get(198)).toBe(true);
  });

  it('serializes and restores via words', () => {
    const bv = new BitVector();
    for (let i = 0; i < 70; i++) bv.push(i % 5 === 0);
    const restored = BitVector.fromWords(bv.toWords(), bv.length);
    for (let i = 0; i < 70; i++) expect(restored.get(i)).toBe(i % 5 === 0);
  });

  it('throws on out-of-bounds get', () => {
    const bv = new BitVector();
    bv.push(true);
    expect(() => bv.get(5)).toThrow(RangeError);
  });
});

describe('compareScalars', () => {
  it('orders nulls first', () => {
    expect(compareScalars(null, 5)).toBeLessThan(0);
    expect(compareScalars(5, null)).toBeGreaterThan(0);
    expect(compareScalars(null, null)).toBe(0);
  });
  it('orders numbers numerically', () => {
    expect(compareScalars(3, 10)).toBeLessThan(0);
  });
  it('orders strings lexically', () => {
    expect(compareScalars('apple', 'banana')).toBeLessThan(0);
  });
});

describe('evalPredicate', () => {
  it('eq/neq', () => {
    expect(evalPredicate({ column: 'c', op: 'eq', value: 5 }, 5)).toBe(true);
    expect(evalPredicate({ column: 'c', op: 'neq', value: 5 }, 5)).toBe(false);
    expect(evalPredicate({ column: 'c', op: 'neq', value: 5 }, null)).toBe(false);
  });
  it('in', () => {
    expect(evalPredicate({ column: 'c', op: 'in', value: ['a', 'b'] }, 'b')).toBe(true);
    expect(evalPredicate({ column: 'c', op: 'in', value: ['a', 'b'] }, 'z')).toBe(false);
  });
  it('null ops', () => {
    expect(evalPredicate({ column: 'c', op: 'isNull' }, null)).toBe(true);
    expect(evalPredicate({ column: 'c', op: 'notNull' }, 3)).toBe(true);
  });
});

describe('ColumnarTable — encodings', () => {
  it('selects dictionary encoding for low-cardinality column', () => {
    const t = new ColumnarTable('t', SCHEMA, { chunkSize: 100 });
    // region cycles through 4 values → dictionary; id unique → plain
    t.appendBatch(makeRows(200));
    const stats = t.chunkStats('region');
    expect(stats[0].encoding === 'dictionary' || stats[0].encoding === 'dictionary-rle').toBe(true);
    expect(stats[0].distinctCount).toBe(4);
  });

  it('selects RLE for constant runs', () => {
    const schema: ColumnSchema[] = [{ name: 'flag', type: 'boolean', nullable: false }];
    const t = new ColumnarTable('t', schema, { chunkSize: 500 });
    for (let i = 0; i < 500; i++) t.appendRow({ flag: i < 250 });
    const stats = t.chunkStats('flag');
    // 2 runs out of 500 rows → RLE-family encoding wins
    expect(stats[0].encoding === 'rle' || stats[0].encoding === 'dictionary-rle').toBe(true);
    expect(stats[0].encodedBytes).toBeLessThan(100);
  });

  it('round-trips all values through encode/decode', () => {
    const t = new ColumnarTable('t', SCHEMA, { chunkSize: 64 });
    const rows = makeRows(250);
    t.appendBatch(rows);
    const res = t.scan([], ['id', 'region', 'amount', 'active']);
    expect(res.rows.length).toBe(250);
    for (let i = 0; i < 250; i++) {
      expect(res.rows[i].id).toBe(rows[i].id);
      expect(res.rows[i].region).toBe(rows[i].region);
      expect(res.rows[i].amount).toBe(rows[i].amount);
    }
  });

  it('stores and returns NULLs via bitmap', () => {
    const t = new ColumnarTable('t', SCHEMA, { chunkSize: 50 });
    for (let i = 0; i < 100; i++) {
      t.appendRow({ id: i, region: 'x', amount: i % 3 === 0 ? null : i, active: true });
    }
    const res = t.scan([{ column: 'amount', op: 'isNull' }]);
    expect(res.rows.length).toBe(34);
    const nn = t.scan([{ column: 'amount', op: 'notNull' }]);
    expect(nn.rows.length).toBe(66);
  });

  it('rejects NULL into NOT NULL column', () => {
    const t = new ColumnarTable('t', SCHEMA);
    expect(() => t.appendRow({ id: 1, region: 'a', amount: null, active: true })).toBeDefined();
    expect(() => t.appendRow({ id: null, region: 'a', amount: 1, active: true })).toThrow();
  });

  it('rejects type-incompatible values', () => {
    const t = new ColumnarTable('t', SCHEMA);
    expect(() => t.appendRow({ id: 'abc', region: 'a', amount: 1, active: true })).toThrow(TypeError);
  });
});

describe('ColumnarTable — scans & pruning', () => {
  let table: ColumnarTable;

  beforeEach(() => {
    table = new ColumnarTable('t', SCHEMA, { chunkSize: 100 });
    // 3 chunks, ids 0-299 sorted → zone maps distinct per chunk
    table.appendBatch(makeRows(300, (i) => `r${i % 4}`));
  });

  it('full scan returns all rows', () => {
    const res = table.scan([]);
    expect(res.rows.length).toBe(300);
    expect(res.chunksScanned).toBe(3);
  });

  it('equality predicate filters rows', () => {
    const res = table.scan([{ column: 'region', op: 'eq', value: 'r2' }]);
    expect(res.rows.length).toBe(75);
    expect(res.rows.every((r) => r.region === 'r2')).toBe(true);
  });

  it('zone-map pruning skips whole chunks', () => {
    // id values per chunk: [0..99], [100..199], [200..299]
    const res = table.scan([{ column: 'id', op: 'lt', value: 50 }]);
    expect(res.chunksPruned).toBe(2); // chunks 1,2 min ≥ 100 > 50
    expect(res.chunksScanned).toBe(1);
    expect(res.rows.length).toBe(50);
  });

  it('gte boundary prunes correctly', () => {
    const res = table.scan([{ column: 'id', op: 'gte', value: 200 }]);
    expect(res.chunksPruned).toBe(2);
    expect(res.rows.length).toBe(100);
  });

  it('projection limits decoded columns', () => {
    const res = table.scan([], ['id']);
    expect(Object.keys(res.rows[0])).toEqual(['id']);
  });

  it('rowAt fetches arbitrary row', () => {
    const row = table.rowAt(157);
    expect(row.id).toBe(157);
    expect(row.region).toBe('r1'); // 157 % 4 = 1
  });

  it('rowAt throws out of bounds', () => {
    expect(() => table.rowAt(999)).toThrow(RangeError);
  });

  it('encoded size is smaller than raw for repetitive data', () => {
    const schema: ColumnSchema[] = [{ name: 'c', type: 'string', nullable: false }];
    const t = new ColumnarTable('rep', schema, { chunkSize: 1000 });
    for (let i = 0; i < 1000; i++) t.appendRow({ c: 'constant-value' });
    const encoded = t.encodedSizeBytes();
    expect(encoded).toBeLessThan(1000 * 14); // much less than 14KB raw
  });
});
