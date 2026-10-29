/**
 * Columnar format, transaction log, partitioning, compaction, schema evolution tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ColumnarFileReader, ColumnarFileWriter } from '../engine/ColumnarFileFormat';
import { ConcurrentModificationError, DeltaTable } from '../engine/TransactionLog';
import { Compactor, buildPath, parsePath, partitionPredicate, prunePaths } from '../engine/HivePartitioning';
import { LakeObjectStore } from '../engine/ZoneManager';
import { SchemaRegistry, checkCompatibility, diffSchemas } from '../engine/SchemaEvolution';
import type { LakeColumnSchema, LakeRow } from '../engine/ColumnarFileFormat';

const SCHEMA: LakeColumnSchema[] = [
  { name: 'id', type: 'int32', nullable: false },
  { name: 'name', type: 'utf8', nullable: false },
  { name: 'score', type: 'float64', nullable: true },
  { name: 'ok', type: 'boolean', nullable: false },
];

function rows(n: number): LakeRow[] {
  const out: LakeRow[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: i, name: `n${i % 7}`, score: i % 5 === 0 ? null : i * 0.5, ok: i % 2 === 0 });
  }
  return out;
}

describe('ColumnarFileFormat', () => {
  it('write/read round-trips all types', () => {
    const w = new ColumnarFileWriter(SCHEMA, { rowGroupSize: 50 });
    w.writeRows(rows(120));
    const bytes = w.finish();
    const r = new ColumnarFileReader(bytes);
    expect(r.rowCount).toBe(120);
    expect(r.rowGroupCount).toBe(3);
    const out = r.read();
    expect(out.length).toBe(120);
    expect(out[7].id).toBe(7);
    expect(out[7].name).toBe('n0'); // 7 % 7 = 0
    expect(out[10].score).toBeNull(); // 10 % 5 = 0
    expect(out[7].ok).toBe(false); // odd → false
  });

  it('rejects bad magic', () => {
    expect(() => new ColumnarFileReader(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow('bad magic');
  });

  it('projection returns only requested columns', () => {
    const w = new ColumnarFileWriter(SCHEMA);
    w.writeRows(rows(10));
    const r = new ColumnarFileReader(w.finish());
    const out = r.read({ columns: ['id'] });
    expect(Object.keys(out[0])).toEqual(['id']);
  });

  it('zone-map filter skips non-matching groups', () => {
    const schema: LakeColumnSchema[] = [{ name: 'v', type: 'int32', nullable: false }];
    const w = new ColumnarFileWriter(schema, { rowGroupSize: 10 });
    for (let i = 0; i < 30; i++) w.writeRow({ v: i }); // groups [0-9],[10-19],[20-29]
    const r = new ColumnarFileReader(w.finish());
    const out = r.read({ filter: { column: 'v', eq: 15 } });
    expect(out.length).toBe(1);
    expect(out[0].v).toBe(15);
    // Impossible value → no rows
    expect(r.read({ filter: { column: 'v', eq: 99 } }).length).toBe(0);
  });

  it('dictionary encoding kicks in for low-cardinality strings', () => {
    const schema: LakeColumnSchema[] = [{ name: 'cat', type: 'utf8', nullable: false }];
    const w = new ColumnarFileWriter(schema, { rowGroupSize: 100 });
    for (let i = 0; i < 100; i++) w.writeRow({ cat: `c${i % 3}` });
    const r = new ColumnarFileReader(w.finish());
    const stats = r.columnStats(0, 'cat');
    expect(stats?.encoding).toBe('dict-rle');
    const out = r.read();
    expect(out[50].cat).toBe('c2');
  });
});

describe('DeltaTable / TransactionLog', () => {
  let store: LakeObjectStore;
  let table: DeltaTable;

  beforeEach(() => {
    store = new LakeObjectStore();
    table = new DeltaTable(store, 'curated/events');
    table.log.initialise(SCHEMA, ['dt']);
  });

  const file = (name: string, content = 'x') => ({
    path: name,
    data: new TextEncoder().encode(content),
  });

  it('append commits add actions', () => {
    const v = table.write([file('part-0'), file('part-1')]);
    expect(v).toBe(1);
    expect(table.log.snapshot().files.size).toBe(2);
    expect(table.files().length).toBe(2);
  });

  it('overwrite removes previous files', () => {
    table.write([file('a'), file('b')]);
    table.write([file('c')], 'overwrite');
    const snap = table.log.snapshot();
    expect(snap.files.size).toBe(1);
    expect([...snap.files.keys()][0]).toContain('c');
  });

  it('time travel reads old snapshot', () => {
    table.write([file('a')]);
    table.write([file('b')]);
    const v1 = table.log.snapshotAt(1);
    expect(v1.files.size).toBe(1);
    const v2 = table.log.snapshotAt(2);
    expect(v2.files.size).toBe(2);
  });

  it('OCC conflict throws ConcurrentModificationError', () => {
    table.write([file('a')]);
    // Simulate foreign writer committing behind the table's back:
    const foreign = new DeltaTable(store, 'curated/events');
    foreign.write([file('foreign')]); // version 2
    // Now commit at stale expected version 1 through raw log
    expect(() => table.log.commit(1, [{ type: 'add', path: 'x', sizeBytes: 1, partitionValues: {} }])).toThrow(
      ConcurrentModificationError
    );
  });

  it('history lists commits', () => {
    table.write([file('a')]);
    table.write([file('b')]);
    const h = table.log.history();
    expect(h.length).toBe(3); // init + 2 commits
    expect(h[2].version).toBe(2);
  });

  it('vacuum deletes only tombstoned files past retention', () => {
    table.write([file('a'), file('b')]);
    // Overwrite removes a,b and adds c
    table.write([file('c')], 'overwrite');
    const freed = table.log.vacuum(0); // retention 0 → everything tombstoned is fair game
    expect(freed.length).toBe(2); // a and b
    expect(store.get('curated/events/a')).toBeUndefined();
    // live file c survives
    expect(store.get('curated/events/c')).toBeDefined();
  });
});

describe('Hive partitioning', () => {
  it('buildPath / parsePath round-trip', () => {
    const p = buildPath(['curated', 'events'], { dt: '2024-01-01', country: 'us' }, 'part-0.bin');
    expect(p).toBe('curated/events/country=us/dt=2024-01-01/part-0.bin');
    const parsed = parsePath(p);
    expect(parsed.partitions.dt).toBe('2024-01-01');
    expect(parsed.partitions.country).toBe('us');
    expect(parsed.fileName).toBe('part-0.bin');
  });

  it('encodes special characters', () => {
    const p = buildPath([], { 'weird key': 'a/b' }, 'f');
    const parsed = parsePath(p);
    expect(parsed.partitions['weird key']).toBe('a/b');
  });

  it('prunePaths eliminates non-matching partitions', () => {
    const paths = [
      buildPath([], { dt: '2024-01-01' }, 'f1'),
      buildPath([], { dt: '2024-01-02' }, 'f2'),
      buildPath([], { dt: '2024-01-03' }, 'f3'),
    ];
    const kept = prunePaths(paths, partitionPredicate([{ column: 'dt', op: 'gte', value: '2024-01-02' }]));
    expect(kept.length).toBe(2);
  });

  it('missing partition column keeps path (conservative)', () => {
    const paths = [buildPath([], { other: 'x' }, 'f')];
    const kept = prunePaths(paths, partitionPredicate([{ column: 'dt', op: 'eq', value: '2024' }]));
    expect(kept.length).toBe(1);
  });
});

describe('Compactor', () => {
  it('plan packs small files via FFD', () => {
    const c = new Compactor({ targetSizeBytes: 100 });
    const files = [
      { path: 'a', sizeBytes: 60 },
      { path: 'b', sizeBytes: 50 },
      { path: 'c', sizeBytes: 40 },
      { path: 'd', sizeBytes: 30 },
      { path: 'e', sizeBytes: 10 },
    ];
    const plan = c.plan(files);
    // FFD desc: 60+40=100, 50+30+10=90 → 2 bins
    expect(plan.totalOutputFiles).toBe(2);
    expect(plan.bins.flatMap((b) => b.inputs).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('skips files already at target size', () => {
    const c = new Compactor({ targetSizeBytes: 100 });
    const plan = c.plan([{ path: 'big', sizeBytes: 200 }, { path: 's1', sizeBytes: 10 }, { path: 's2', sizeBytes: 10 }]);
    expect(plan.skipped).toContain('big');
    expect(plan.bins.length).toBe(1);
  });

  it('execute merges and commits remove+add', () => {
    const store = new LakeObjectStore();
    const table = new DeltaTable(store, 'curated/t');
    table.log.initialise([{ name: 'v', type: 'int32', nullable: false }]);
    table.write([
      { path: 'f1', data: new Uint8Array(40) },
      { path: 'f2', data: new Uint8Array(40) },
      { path: 'f3', data: new Uint8Array(40) },
    ]);
    const c = new Compactor({ targetSizeBytes: 100 });
    const candidates = [...table.log.snapshot().files.values()].map((f) => ({ path: f.path, sizeBytes: f.sizeBytes }));
    const plan = c.plan(candidates);
    expect(plan.bins.length).toBe(1);
    const { newFiles } = c.execute(table, store, plan);
    expect(newFiles.length).toBe(1);
    const snap = table.log.snapshot();
    // f1+f2 merged into compact file; f3 (singleton bin) stays live.
    expect(snap.files.size).toBe(2);
    const live = [...snap.files.keys()];
    expect(live.some((p) => p.includes('compact-'))).toBe(true);
    expect(live.some((p) => p.endsWith('f3'))).toBe(true);
  });
});

describe('SchemaEvolution', () => {
  const v1: LakeColumnSchema[] = [
    { name: 'id', type: 'int32', nullable: false },
    { name: 'name', type: 'utf8', nullable: false },
  ];

  it('adding nullable column is backward compatible', () => {
    const v2 = [...v1, { name: 'extra', type: 'utf8' as const, nullable: true }];
    expect(checkCompatibility(v1, v2, 'backward').length).toBe(0);
  });

  it('adding required column violates backward compat', () => {
    const v2 = [...v1, { name: 'extra', type: 'utf8' as const, nullable: false }];
    const v = checkCompatibility(v1, v2, 'backward');
    expect(v.length).toBe(1);
    expect(v[0].direction).toBe('backward');
  });

  it('dropping column violates forward compat', () => {
    const v2 = v1.slice(0, 1);
    const v = checkCompatibility(v1, v2, 'forward');
    expect(v.length).toBe(1);
    expect(v[0].direction).toBe('forward');
  });

  it('int32→int64 widening is backward compatible', () => {
    const v2: LakeColumnSchema[] = [
      { name: 'id', type: 'int64', nullable: false },
      { name: 'name', type: 'utf8', nullable: false },
    ];
    expect(checkCompatibility(v1, v2, 'backward').length).toBe(0);
  });

  it('int64→int32 narrowing is not backward compatible', () => {
    const wide: LakeColumnSchema[] = [{ name: 'id', type: 'int64', nullable: false }];
    const narrow: LakeColumnSchema[] = [{ name: 'id', type: 'int32', nullable: false }];
    expect(checkCompatibility(wide, narrow, 'backward').length).toBe(1);
  });

  it('tightening nullability violates backward compat', () => {
    const loose: LakeColumnSchema[] = [{ name: 'x', type: 'utf8', nullable: true }];
    const tight: LakeColumnSchema[] = [{ name: 'x', type: 'utf8', nullable: false }];
    expect(checkCompatibility(loose, tight, 'backward').length).toBe(1);
  });

  it('diffSchemas reports changes', () => {
    const v2: LakeColumnSchema[] = [
      { name: 'id', type: 'int64', nullable: false },
      { name: 'extra', type: 'utf8', nullable: true },
    ];
    const changes = diffSchemas(v1, v2);
    const kinds = changes.map((c) => c.kind).sort();
    expect(kinds).toEqual(['added-column', 'dropped-column', 'type-changed']);
  });

  it('registry enforces mode and tracks versions', () => {
    const reg = new SchemaRegistry(v1, 'backward');
    const v2 = reg.evolve([...v1, { name: 'e', type: 'utf8', nullable: true }]);
    expect(v2.version).toBe(1);
    expect(() => reg.evolve([{ name: 'id', type: 'utf8', nullable: false }])).toThrow('Schema evolution rejected');
    expect(reg.versions.length).toBe(2); // rejected evolve didn't register
  });

  it('projectRow fills missing columns with null', () => {
    const reg = new SchemaRegistry(v1, 'backward');
    reg.evolve([...v1, { name: 'e', type: 'utf8', nullable: true }]);
    const projected = reg.projectRow({ id: 1, name: 'x' }, 0);
    expect(projected.e).toBeNull();
    expect(projected.id).toBe(1);
  });
});
