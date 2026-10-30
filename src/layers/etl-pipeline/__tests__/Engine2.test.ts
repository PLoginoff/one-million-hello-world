/**
 * ETL Pipeline Engine 2 tests — reconciliation, incremental CDC,
 * dependency scheduling, error quarantine, schema versioning.
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { reconcile, Reconciler, hashRow } from '../engine2/Reconciliation';
import {
  ArrayChangeLog,
  CollectingSink,
  IncrementalCdcProcessor,
  MemoryPositionStore,
} from '../engine2/IncrementalCdc';
import { DependencyGraph, ParallelScheduler } from '../engine2/PipelineDeps';
import { MemoryQuarantineSink, QuarantinedPipeline } from '../engine2/ErrorQuarantine';
import { diffSchemas, PipelineVersionRegistry, PipelineSchema } from '../engine2/PipelineVersioning';
import { RowValidator, rulesFromSchema, ValidationError } from '../engine2/RowValidator';
import { Row } from '../engine/DagEngine';
import { CdcEvent } from '../engine/CdcEngine';

/* ---------------------------------------------------------------------- */
/* Reconciliation                                                         */
/* ---------------------------------------------------------------------- */

describe('Reconciler', () => {
  const src: Row[] = [
    { id: 1, name: 'a', v: 10 },
    { id: 2, name: 'b', v: 20 },
    { id: 3, name: 'c', v: 30 },
  ];

  it('clean run: counts+checksums match', () => {
    const r = reconcile(src, [...src], { keyColumn: 'id' });
    expect(r.countsMatch).toBe(true);
    expect(r.checksumsMatch).toBe(true);
    expect(r.keyDiff.inSourceOnly.length).toBe(0);
    expect(r.keyDiff.differing.length).toBe(0);
  });

  it('detects a missing target row', () => {
    const r = reconcile(src, src.slice(0, 2), { keyColumn: 'id' });
    expect(r.countsMatch).toBe(false);
    expect(r.checksumsMatch).toBe(false);
    expect(r.keyDiff.inSourceOnly).toEqual(['3']);
    expect(r.samples[0].source!.id).toBe(3);
  });

  it('detects an extra target row', () => {
    const tgt = [...src, { id: 99, name: 'x', v: 0 }];
    const r = reconcile(src, tgt, { keyColumn: 'id' });
    expect(r.keyDiff.inTargetOnly).toEqual(['99']);
  });

  it('detects a mutated row', () => {
    const tgt = [{ id: 1, name: 'a', v: 10 }, { id: 2, name: 'CHANGED', v: 20 }, { id: 3, name: 'c', v: 30 }];
    const r = reconcile(src, tgt, { keyColumn: 'id' });
    expect(r.countsMatch).toBe(true); // same count, different content
    expect(r.checksumsMatch).toBe(false);
    expect(r.keyDiff.differing).toEqual(['2']);
    expect(r.samples[0].target!.name).toBe('CHANGED');
  });

  it('checksum is order-insensitive', () => {
    const r = reconcile(src, [src[2], src[0], src[1]], { keyColumn: 'id' });
    expect(r.checksumsMatch).toBe(true);
  });

  it('partial checksum columns ignore others', () => {
    const tgt = [{ id: 1, name: 'DIFFERENT', v: 10 }, src[1], src[2]];
    const r = reconcile(src, tgt, { keyColumn: 'id', checksumColumns: ['id', 'v'] });
    expect(r.checksumsMatch).toBe(true); // name difference ignored
  });
});

/* ---------------------------------------------------------------------- */
/* Incremental CDC                                                        */
/* ---------------------------------------------------------------------- */

const ev = (position: number, key = 'k'): CdcEvent => ({
  position,
  key: key + position,
  op: 'insert',
  row: { id: key + position },
});

describe('IncrementalCdcProcessor', () => {
  let log: ArrayChangeLog;
  let sink: CollectingSink;
  let store: MemoryPositionStore;

  beforeEach(() => {
    log = new ArrayChangeLog();
    sink = new CollectingSink();
    store = new MemoryPositionStore();
  });

  it('applies all events and commits position', async () => {
    log.pushAll([ev(1), ev(2), ev(3)]);
    const p = new IncrementalCdcProcessor(log, sink, store);
    const r = await p.run();
    expect(r.eventsApplied).toBe(3);
    expect(r.toPosition).toBe(3);
    expect(sink.applied.length).toBe(3);
    expect(store.load()).toBe(3);
  });

  it('resumes from committed position', async () => {
    log.pushAll([ev(1), ev(2)]);
    const p = new IncrementalCdcProcessor(log, sink, store);
    await p.run();
    // new events arrive; new processor with same store resumes
    log.pushAll([ev(3), ev(4)]);
    const p2 = new IncrementalCdcProcessor(log, sink, store);
    const r = await p2.run();
    expect(r.fromPosition).toBe(2);
    expect(r.eventsApplied).toBe(2);
    expect(sink.applied.length).toBe(4);
  });

  it('batches correctly', async () => {
    for (let i = 1; i <= 7; i++) log.push(ev(i));
    const p = new IncrementalCdcProcessor(log, sink, store, { batchSize: 3 });
    const r = await p.run();
    expect(r.batches).toBe(3); // 3 + 3 + 1
  });

  it('dedupes redelivered positions (at-least-once safety)', async () => {
    log.pushAll([ev(1), ev(2), ev(2), ev(3)]); // duplicated position 2
    const p = new IncrementalCdcProcessor(log, sink, store);
    const r = await p.run();
    expect(r.eventsApplied).toBe(3);
    expect(r.duplicatesDropped).toBe(1);
    expect(sink.applied.length).toBe(3);
  });

  it('savepoint/restore round-trips', async () => {
    log.pushAll([ev(1), ev(2)]);
    const p = new IncrementalCdcProcessor(log, sink, store);
    await p.run();
    const sp = p.savepoint();
    const p2 = new IncrementalCdcProcessor(log, sink, new MemoryPositionStore());
    p2.restore(sp);
    expect(p2.committedPosition).toBe(2);
  });
});

/* ---------------------------------------------------------------------- */
/* Dependency scheduling                                                  */
/* ---------------------------------------------------------------------- */

describe('DependencyGraph', () => {
  it('topological order respects deps', () => {
    const g = new DependencyGraph();
    g.add({ id: 'extract', dependsOn: [] });
    g.add({ id: 'transform', dependsOn: ['extract'] });
    g.add({ id: 'load', dependsOn: ['transform'] });
    g.add({ id: 'audit', dependsOn: ['load'] });
    expect(g.runOrder()).toEqual(['extract', 'transform', 'load', 'audit']);
  });

  it('groups independent pipelines into parallel layers', () => {
    const g = new DependencyGraph();
    g.add({ id: 'a', dependsOn: [] });
    g.add({ id: 'b', dependsOn: [] });
    g.add({ id: 'c', dependsOn: ['a'] });
    g.add({ id: 'd', dependsOn: ['b', 'c'] });
    const layers = g.layers();
    expect(layers[0].sort()).toEqual(['a', 'b']);
    expect(layers[1]).toEqual(['c']);
    expect(layers[2]).toEqual(['d']);
  });

  it('detects cycles', () => {
    const g = new DependencyGraph();
    g.add({ id: 'a', dependsOn: ['c'] });
    g.add({ id: 'b', dependsOn: ['a'] });
    g.add({ id: 'c', dependsOn: ['b'] });
    expect(() => g.runOrder()).toThrow(/cycle/);
  });

  it('critical path = longest dep chain', () => {
    const g = new DependencyGraph();
    g.add({ id: 'a', dependsOn: [], estDurationMs: 10 });
    g.add({ id: 'b', dependsOn: ['a'], estDurationMs: 20 });
    g.add({ id: 'c', dependsOn: [], estDurationMs: 5 });
    g.add({ id: 'd', dependsOn: ['b', 'c'], estDurationMs: 7 });
    expect(g.criticalPathMs()).toBe(37); // a→b→d
  });
});

describe('ParallelScheduler', () => {
  it('runs all pipelines and reports success', async () => {
    const g = new DependencyGraph();
    g.add({ id: 'a', dependsOn: [] });
    g.add({ id: 'b', dependsOn: ['a'] });
    const order: string[] = [];
    const s = new ParallelScheduler({ maxConcurrency: 2 });
    const results = await s.run(g, async (id) => {
      order.push(id);
    });
    expect(results.every((r) => r.status === 'success')).toBe(true);
    expect(order).toEqual(['a', 'b']);
  });

  it('skips dependents of failed pipelines', async () => {
    const g = new DependencyGraph();
    g.add({ id: 'a', dependsOn: [] });
    g.add({ id: 'b', dependsOn: ['a'] });
    g.add({ id: 'c', dependsOn: ['b'] });
    const s = new ParallelScheduler();
    const results = await s.run(g, async (id) => {
      if (id === 'b') throw new Error('boom');
    });
    const byId = new Map(results.map((r) => [r.id, r.status]));
    expect(byId.get('a')).toBe('success');
    expect(byId.get('b')).toBe('failed');
    expect(byId.get('c')).toBe('skipped');
  });

  it('bounded concurrency runs independent branches in parallel', async () => {
    const g = new DependencyGraph();
    g.add({ id: 'a', dependsOn: [] });
    g.add({ id: 'b', dependsOn: [] });
    g.add({ id: 'c', dependsOn: [] });
    let concurrent = 0;
    let maxConcurrent = 0;
    const s = new ParallelScheduler({ maxConcurrency: 3 });
    await s.run(g, async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
    });
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});

/* ---------------------------------------------------------------------- */
/* Error quarantine                                                       */
/* ---------------------------------------------------------------------- */

describe('QuarantinedPipeline', () => {
  it('routes bad rows to the sink, good rows through', async () => {
    const sink = new MemoryQuarantineSink();
    const p = new QuarantinedPipeline(
      (row) => {
        if (typeof row.v !== 'number') throw new Error('v not a number');
        return { ...row, v: (row.v as number) * 2 };
      },
      sink,
      { stage: 'transform' }
    );
    const out = await p.processBatch([
      { id: 1, v: 5 },
      { id: 2, v: 'bad' },
      { id: 3, v: 7 },
    ]);
    expect(out.length).toBe(2);
    expect(out[0].v).toBe(10);
    expect(sink.recordsAll().length).toBe(1);
    expect(sink.recordsAll()[0].row.id).toBe(2);
    expect(sink.recordsAll()[0].stage).toBe('transform');
  });

  it('infers schema of bad rows', async () => {
    const sink = new MemoryQuarantineSink();
    const p = new QuarantinedPipeline(
      () => {
        throw new Error('always fails');
      },
      sink,
      { stage: 's' }
    );
    await p.process({ a: 1, b: 'x' });
    await p.process({ a: 'string!', b: 'y' });
    const schema = sink.schema();
    expect(schema.recordCount).toBe(2);
    expect(schema.columns.a).toEqual(['number', 'string']);
  });

  it('groups identical failure classes', async () => {
    const sink = new MemoryQuarantineSink();
    const p = new QuarantinedPipeline(
      (row) => {
        if (row.x === 1) throw new Error('error with code 42');
        if (row.x === 2) throw new Error('error with code 99');
        throw new Error('different error');
      },
      sink,
      { stage: 's' }
    );
    await p.process({ x: 1 });
    await p.process({ x: 2 });
    await p.process({ x: 3 });
    const h = sink.failureHistogram();
    // 'error with code NN' fingerprints together
    expect(h.get('error with code ?')).toBe(2);
    expect(h.get('different error')).toBe(1);
  });

  it('drain returns all records for replay', async () => {
    const sink = new MemoryQuarantineSink();
    const p = new QuarantinedPipeline(() => {
      throw new Error('x');
    }, sink, { stage: 's' });
    await p.process({ id: 1 });
    const drained = sink.drain();
    expect(drained.length).toBe(1);
    expect(sink.recordsAll().length).toBe(0);
  });
});

/* ---------------------------------------------------------------------- */
/* Schema versioning                                                      */
/* ---------------------------------------------------------------------- */

const v1: PipelineSchema = {
  version: 1,
  columns: [
    { name: 'id', type: 'int32', nullable: false },
    { name: 'name', type: 'string', nullable: true },
  ],
};

describe('diffSchemas', () => {
  it('compatible: add nullable column', () => {
    const v2: PipelineSchema = { version: 2, columns: [...v1.columns, { name: 'email', type: 'string', nullable: true }] };
    const d = diffSchemas(v1, v2, 'backward');
    expect(d.compatible).toBe(true);
    expect(d.added.map((c) => c.name)).toEqual(['email']);
  });

  it('compatible: add column with default', () => {
    const v2: PipelineSchema = {
      version: 2,
      columns: [...v1.columns, { name: 'active', type: 'boolean', nullable: false, defaultValue: true }],
    };
    expect(diffSchemas(v1, v2, 'backward').compatible).toBe(true);
  });

  it('incompatible: add non-nullable column without default', () => {
    const v2: PipelineSchema = {
      version: 2,
      columns: [...v1.columns, { name: 'ssn', type: 'string', nullable: false }],
    };
    const d = diffSchemas(v1, v2, 'backward');
    expect(d.compatible).toBe(false);
    expect(d.violations[0]).toContain('ssn');
  });

  it('incompatible: remove a column (backward mode)', () => {
    const v2: PipelineSchema = { version: 2, columns: [v1.columns[0]] };
    const d = diffSchemas(v1, v2, 'backward');
    expect(d.compatible).toBe(false);
    expect(d.removed.map((c) => c.name)).toEqual(['name']);
  });

  it('widening int32 → int64 is compatible', () => {
    const v2: PipelineSchema = {
      version: 2,
      columns: [{ name: 'id', type: 'int64', nullable: false }, v1.columns[1]],
    };
    const d = diffSchemas(v1, v2, 'backward');
    expect(d.compatible).toBe(true);
    expect(d.typeChanges[0].widening).toBe(true);
  });

  it('narrowing string → int32 is incompatible', () => {
    const v2: PipelineSchema = {
      version: 2,
      columns: [v1.columns[0], { name: 'name', type: 'int32', nullable: true }],
    };
    const d = diffSchemas(v1, v2, 'backward');
    expect(d.compatible).toBe(false);
  });
});

describe('RowValidator', () => {
  const rules = rulesFromSchema(
    [
      { name: 'id', type: 'int64', nullable: false },
      { name: 'email', type: 'string', nullable: true },
      { name: 'age', type: 'int32', nullable: true },
    ],
    [{ column: 'age', check: 'range', min: 0, max: 150, message: 'age out of range' }]
  );
  const v = new RowValidator(rules);

  it('passes a valid row', () => {
    expect(v.validate({ id: 1, email: 'a@b', age: 30 }).length).toBe(0);
  });

  it('reports every violation', () => {
    const out = v.validate({ email: 'x', age: 999 });
    // missing id (required) + age range
    expect(out.length).toBe(2);
    expect(out.some((o) => o.column === 'id')).toBe(true);
    expect(out.some((o) => o.message === 'age out of range')).toBe(true);
  });

  it('assertValid throws ValidationError with details', () => {
    try {
      v.assertValid({ id: 'not-a-number' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).violations.length).toBeGreaterThan(0);
    }
  });

  it('feeds QuarantinedPipeline — bad rows quarantined with schema', async () => {
    const sink = new MemoryQuarantineSink();
    const p = new QuarantinedPipeline((r) => v.assertValid(r), sink, { stage: 'validate' });
    const out = await p.processBatch([
      { id: 1, email: 'a', age: 20 },
      { id: 2, email: 'b', age: 999 }, // range violation
      { email: 'c', age: 30 },          // missing id
    ]);
    expect(out.length).toBe(1);
    expect(sink.recordsAll().length).toBe(2);
  });

  it('enum + regex checks', () => {
    const vv = new RowValidator([
      { column: 'status', check: 'enum', values: ['ok', 'pending'] },
      { column: 'email', check: 'regex', pattern: /^[^@]+@[^@]+$/ },
    ]);
    expect(vv.validate({ status: 'bad', email: 'not-an-email' }).length).toBe(2);
    expect(vv.validate({ status: 'ok', email: 'a@b.c' }).length).toBe(0);
  });
});

describe('PipelineVersionRegistry', () => {
  it('tracks versions and rejects incompatible upgrades', () => {
    const reg = new PipelineVersionRegistry('backward');
    expect(reg.register('etl-orders', v1)).toBeNull(); // first version
    const bad: PipelineSchema = { version: 2, columns: [] }; // drops all
    const d = reg.register('etl-orders', bad);
    expect(d!.compatible).toBe(false);
    expect(reg.latest('etl-orders')!.version).toBe(1); // not registered
  });

  it('migrates a row to a new schema with defaults', () => {
    const reg = new PipelineVersionRegistry();
    reg.register('p', v1);
    const v2: PipelineSchema = {
      version: 2,
      columns: [...v1.columns, { name: 'src', type: 'string', nullable: false, defaultValue: 'web' }],
    };
    reg.register('p', v2);
    const migrated = reg.migrate({ id: 1, name: 'a' }, v1, v2);
    expect(migrated.src).toBe('web');
    expect(migrated.id).toBe(1);
  });
});
