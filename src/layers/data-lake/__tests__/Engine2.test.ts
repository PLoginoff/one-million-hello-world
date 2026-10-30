/**
 * Data Lake Engine2 — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { LakeObjectStore } from '../engine/ZoneManager';
import { LakeColumnSchema, LakeRow } from '../engine/ColumnarFileFormat';
import {
  SchemaViolationError,
  validateRows,
  VersionedTable,
  VersionNotFoundError,
} from '../engine2/VersionedTable';
import { CompactionEngine } from '../engine2/CompactionEngine';
import { PartitionStats } from '../engine2/PartitionStats';

const SCHEMA: readonly LakeColumnSchema[] = [
  { name: 'id', type: 'int64', nullable: false },
  { name: 'name', type: 'utf8', nullable: false },
  { name: 'score', type: 'float64', nullable: true },
];

function store(): LakeObjectStore {
  return new LakeObjectStore();
}

function table(s: LakeObjectStore = store()): VersionedTable {
  return new VersionedTable(s, 'lake/people', SCHEMA);
}

function rows(n: number, idOffset = 0): LakeRow[] {
  const out: LakeRow[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: idOffset + i, name: `p${idOffset + i}`, score: i * 0.5 });
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/* Schema enforcement                                                      */
/* ----------------------------------------------------------------------- */

describe('schema enforcement', () => {
  it('accepts conforming rows', () => {
    const t = table();
    const f = t.write(rows(5));
    expect(f.rowCount).toBe(5);
    expect(t.version).toBe(1);
  });

  it('rejects non-nullable column with null', () => {
    const t = table();
    expect(() => t.write([{ id: 1, name: null, score: 1 }])).toThrow(SchemaViolationError);
  });

  it('rejects wrong scalar type', () => {
    const t = table();
    expect(() => t.write([{ id: 'x', name: 'a', score: 1 }])).toThrow(SchemaViolationError);
  });

  it('rejects unexpected extra columns', () => {
    const t = table();
    expect(() => t.write([{ id: 1, name: 'a', ghost: 1 }])).toThrow(SchemaViolationError);
  });

  it('rejects int32 overflow', () => {
    const s: LakeObjectStore = store();
    const t = new VersionedTable(s, 'lake/n', [
      { name: 'x', type: 'int32', nullable: false },
    ]);
    expect(() => t.write([{ x: 3_000_000_000 }])).toThrow(SchemaViolationError);
  });

  it('allowDropInvalid drops offending rows', () => {
    const t = table();
    const f = t.write(
      [
        { id: 1, name: 'ok', score: 0 },
        { id: 'bad', name: 'no', score: 0 },
        { id: 2, name: 'ok2', score: 0 },
      ],
      { allowDropInvalid: true }
    );
    expect(f.rowCount).toBe(2);
    const read = t.read();
    expect(read.map((r) => r.id)).toEqual([1, 2]);
  });

  it('validateRows reports all violations', () => {
    const violations = validateRows(
      [
        { id: 1, name: 'a' },
        { id: 'x', name: null, extra: 1 },
      ],
      SCHEMA
    );
    expect(violations.length).toBeGreaterThanOrEqual(3); // wrong id, null name, extra col
    expect(violations.some((v) => v.includes('row 1'))).toBe(true);
  });
});

/* ----------------------------------------------------------------------- */
/* VersionedTable — writes, reads, time travel                             */
/* ----------------------------------------------------------------------- */

describe('VersionedTable', () => {
  it('read returns all live rows', () => {
    const t = table();
    t.write(rows(3, 0));
    t.write(rows(2, 3));
    expect(t.read().length).toBe(5);
    expect(t.version).toBe(2);
  });

  it('projection limits returned columns', () => {
    const t = table();
    t.write(rows(3));
    const r = t.read(['id']);
    expect(r[0]).toEqual({ id: 0 });
    expect('name' in r[0]).toBe(false);
  });

  it('manifest tracks files and totals', () => {
    const t = table();
    t.write(rows(3));
    t.write(rows(2));
    const m = t.snapshot();
    expect(m.version).toBe(2);
    expect(m.files.length).toBe(2);
    expect(m.totalRows).toBe(5);
    expect(m.totalBytes).toBeGreaterThan(0);
  });

  it('time travel returns rows live at version', () => {
    const t = table();
    t.write(rows(3, 0)); // v1
    t.write(rows(2, 3)); // v2
    t.deleteFiles((f) => f.rowCount === 2); // v3 removes second file
    const v1 = t.readAsOf(1);
    expect(v1.length).toBe(3);
    const v2 = t.readAsOf(2);
    expect(v2.length).toBe(5);
    const v3 = t.readAsOf(3);
    expect(v3.length).toBe(3); // after delete
  });

  it('readAsOf throws for out-of-range version', () => {
    const t = table();
    t.write(rows(2));
    expect(() => t.readAsOf(99)).toThrow(VersionNotFoundError);
  });

  it('versionAtTimestamp picks latest commit ≤ ts', () => {
    let t = 1_000_000;
    const s = store();
    const tbl = new VersionedTable(s, 'lake/x', SCHEMA, [], () => t);
    const t0 = tbl.commits[0].timestamp;
    t += 100;
    tbl.write(rows(1));
    const t1 = tbl.commits[1].timestamp;
    t += 100;
    tbl.write(rows(1));
    const t2 = tbl.commits[2].timestamp;
    expect(tbl.versionAtTimestamp(t0 - 1)).toBe(0);
    expect(tbl.versionAtTimestamp(t1)).toBe(1);
    expect(tbl.versionAtTimestamp(t2)).toBe(2);
    expect(t1).toBeGreaterThan(t0);
    expect(t2).toBeGreaterThan(t1);
  });

  it('deleteFiles commits a remove-only version', () => {
    const t = table();
    t.write(rows(3));
    t.write(rows(2));
    const removed = t.deleteFiles(() => true);
    expect(removed.length).toBe(2);
    expect(t.version).toBe(3);
    expect(t.read().length).toBe(0);
  });

  it('evolveSchema bumps version and swaps schema', () => {
    const t = table();
    t.write(rows(2));
    const newSchema: LakeColumnSchema[] = [
      ...SCHEMA,
      { name: 'age', type: 'int32', nullable: true },
    ];
    t.evolveSchema(newSchema);
    expect(t.version).toBe(2);
    expect(t.schema.length).toBe(4);
    // Old schema data still readable (projection takes care).
    expect(t.read().length).toBe(2);
  });

  it('partitioned writes land in hive paths', () => {
    const s = store();
    const t = new VersionedTable(s, 'lake/events', SCHEMA, ['dt']);
    t.write(rows(2), { partitions: { dt: '2024-01-01' } });
    t.write(rows(2), { partitions: { dt: '2024-01-02' } });
    const m = t.snapshot();
    expect(m.files[0].partitionValues.dt).toBe('2024-01-01');
    expect(m.files[0].path).toContain('dt=2024-01-01');
  });
});

/* ----------------------------------------------------------------------- */
/* CompactionEngine                                                        */
/* ----------------------------------------------------------------------- */

describe('CompactionEngine', () => {
  function busyTable(n: number, rowsPerFile: number): VersionedTable {
    const t = table();
    for (let i = 0; i < n; i++) {
      t.write(rows(rowsPerFile, i * rowsPerFile));
    }
    return t;
  }

  it('plans merge bins for small files', () => {
    const t = busyTable(6, 5);
    const e = new CompactionEngine({ targetFileBytes: 10 * 1024 * 1024, minFilesToCompact: 3 });
    const plan = e.plan(t.snapshot());
    expect(plan.bins.length).toBeGreaterThan(0);
    const totalInputs = plan.bins.reduce((a, b) => a + b.inputs.length, 0);
    expect(totalInputs).toBeGreaterThanOrEqual(3);
  });

  it('skips files already at target size', () => {
    const t = table();
    t.write(rows(3)); // small
    // A "big" file: write many rows to push size past a small target.
    const bigRows: LakeRow[] = [];
    for (let i = 0; i < 2000; i++) bigRows.push({ id: i, name: `x${i}`, score: 0 });
    t.write(bigRows);
    const e = new CompactionEngine({ targetFileBytes: 1000, minFilesToCompact: 2, maxFileBytes: 1000 });
    const plan = e.plan(t.snapshot());
    expect(plan.bins.every((b) => b.inputs.every((p) => p !== t.files[1].path))).toBe(true);
  });

  it('execute merges rows and commits new version', () => {
    const t = busyTable(5, 4); // 5 files × 4 rows = 20 rows
    const e = new CompactionEngine({ targetFileBytes: 10 * 1024 * 1024, minFilesToCompact: 3 });
    const before = t.read().length;
    const res = e.optimize(t);
    expect(res.rowsProcessed).toBe(before);
    expect(res.newFiles.length).toBeGreaterThan(0);
    // All rows still readable — nothing lost.
    expect(t.read().length).toBe(before);
    // New version committed per bin.
    expect(res.committedVersions.length).toBe(res.newFiles.length);
  });

  it('preserves row order within a merge bin', () => {
    const t = table();
    t.write(rows(3, 0));
    t.write(rows(3, 3));
    t.write(rows(3, 6));
    const e = new CompactionEngine({ targetFileBytes: 10 * 1024 * 1024, minFilesToCompact: 3 });
    e.optimize(t);
    const ids = t.read().map((r) => r.id);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('does not merge across partitions', () => {
    const s = store();
    const t = new VersionedTable(s, 'lake/p', SCHEMA, ['region']);
    for (let i = 0; i < 3; i++) t.write(rows(2, i * 2), { partitions: { region: 'us' } });
    for (let i = 0; i < 3; i++) t.write(rows(2, 100 + i * 2), { partitions: { region: 'eu' } });
    const e = new CompactionEngine({ targetFileBytes: 10 * 1024 * 1024, minFilesToCompact: 3 });
    const plan = e.plan(t.snapshot());
    // Two partitions → two separate bins, never merged together.
    const keys = new Set(plan.bins.map((b) => b.partitionKey));
    expect(keys.size).toBe(2);
    for (const bin of plan.bins) {
      expect(bin.inputs.every((p) => p.includes(`region=${bin.partitionKey.split('region=')[1]}`))).toBe(true);
    }
  });

  it('minFilesToCompact keeps lone files untouched', () => {
    const t = table();
    t.write(rows(5));
    const e = new CompactionEngine({ minFilesToCompact: 3 });
    const plan = e.plan(t.snapshot());
    expect(plan.bins.length).toBe(0);
    expect(plan.skipped).toContain(t.files[0].path);
  });
});

/* ----------------------------------------------------------------------- */
/* PartitionStats                                                          */
/* ----------------------------------------------------------------------- */

describe('PartitionStats', () => {
  function partitioned(): VersionedTable {
    const s = store();
    return new VersionedTable(s, 'lake/events', SCHEMA, ['region', 'dt']);
  }

  it('computes per-partition row/byte/file stats', () => {
    const t = partitioned();
    t.write(rows(10), { partitions: { region: 'us', dt: 'd1' } });
    t.write(rows(20), { partitions: { region: 'eu', dt: 'd1' } });
    const a = new PartitionStats().analyze(t.snapshot());
    expect(a.partitionCount).toBe(2);
    const us = a.stats.find((s) => s.partitionValues.region === 'us');
    const eu = a.stats.find((s) => s.partitionValues.region === 'eu');
    expect(us?.rowCount).toBe(10);
    expect(eu?.rowCount).toBe(20);
    expect(eu?.rowShare).toBeCloseTo(20 / 30, 5);
    expect(us?.fileCount).toBe(1);
  });

  it('detects skewed tables via maxToMedian', () => {
    const t = partitioned();
    t.write(rows(100), { partitions: { region: 'hot' } });
    t.write(rows(5), { partitions: { region: 'c1' } });
    t.write(rows(5), { partitions: { region: 'c2' } });
    const a = new PartitionStats({ skewThreshold: 2 }).analyze(t.snapshot());
    expect(a.skew.skewed).toBe(true);
    expect(a.skew.maxToMedianRatio).toBeGreaterThan(2);
    expect(a.skew.hotPartitions[0]).toBe('region=hot');
  });

  it('balanced tables are not skewed', () => {
    const t = partitioned();
    for (const r of ['a', 'b', 'c', 'd']) {
      t.write(rows(10), { partitions: { region: r } });
    }
    const a = new PartitionStats().analyze(t.snapshot());
    expect(a.skew.skewed).toBe(false);
    expect(a.skew.maxToMedianRatio).toBeCloseTo(1, 3);
    expect(a.skew.gini).toBeCloseTo(0, 5);
  });

  it('Gini coefficient: 0 for equality, higher for imbalance', () => {
    const t = partitioned();
    t.write(rows(90), { partitions: { region: 'big' } });
    t.write(rows(10), { partitions: { region: 'small' } });
    const a = new PartitionStats().analyze(t.snapshot());
    expect(a.skew.gini).toBeGreaterThan(0.3);
  });

  it('cold partitions identified below median fraction', () => {
    const t = partitioned();
    t.write(rows(100), { partitions: { region: 'a' } });
    t.write(rows(100), { partitions: { region: 'b' } });
    t.write(rows(2), { partitions: { region: 'tiny' } });
    const a = new PartitionStats({ coldPartitionFrac: 0.1 }).analyze(t.snapshot());
    expect(a.skew.coldPartitions).toContain('region=tiny');
  });

  it('compactionCandidates finds small-file partitions', () => {
    const t = partitioned();
    for (let i = 0; i < 12; i++) {
      t.write(rows(2), { partitions: { region: 'fragmented' } });
    }
    t.write(rows(50), { partitions: { region: 'normal' } });
    const c = new PartitionStats({ smallFileThreshold: 10 }).compactionCandidates(t.snapshot());
    expect(c.map((s) => s.key)).toContain('region=fragmented');
    expect(c.map((s) => s.key)).not.toContain('region=normal');
  });
});
