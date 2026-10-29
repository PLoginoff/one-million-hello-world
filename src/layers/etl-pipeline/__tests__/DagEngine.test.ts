/**
 * DAG pipeline engine tests.
 */

import { describe, it, expect } from 'bun:test';
import { DagPipelineEngine, backoffMs, findCycle, topoLayers } from '../engine/DagEngine';
import type { PipelineDef, RowBatch, StageDef } from '../engine/DagEngine';

const batch = (rows: unknown[], origin = 'test'): RowBatch => ({ rows: rows as Record<string, unknown>[], origin });

describe('topoLayers', () => {
  it('linear chain → single-element layers', () => {
    const stages: StageDef[] = [
      { id: 'a', run: () => batch([]) },
      { id: 'b', dependsOn: ['a'], run: () => batch([]) },
      { id: 'c', dependsOn: ['b'], run: () => batch([]) },
    ];
    expect(topoLayers(stages)).toEqual([['a'], ['b'], ['c']]);
  });

  it('diamond → parallel middle layer', () => {
    const stages: StageDef[] = [
      { id: 'src', run: () => batch([]) },
      { id: 'l', dependsOn: ['src'], run: () => batch([]) },
      { id: 'r', dependsOn: ['src'], run: () => batch([]) },
      { id: 'join', dependsOn: ['l', 'r'], run: () => batch([]) },
    ];
    const layers = topoLayers(stages);
    expect(layers.length).toBe(3);
    expect(layers[1].sort()).toEqual(['l', 'r']);
  });

  it('throws on cycle', () => {
    const stages: StageDef[] = [
      { id: 'a', dependsOn: ['c'], run: () => batch([]) },
      { id: 'b', dependsOn: ['a'], run: () => batch([]) },
      { id: 'c', dependsOn: ['b'], run: () => batch([]) },
    ];
    expect(() => topoLayers(stages)).toThrow('cycle');
  });

  it('throws on unknown dependency', () => {
    const stages: StageDef[] = [{ id: 'a', dependsOn: ['ghost'], run: () => batch([]) }];
    expect(() => topoLayers(stages)).toThrow("unknown stage 'ghost'");
  });

  it('findCycle returns the offending path', () => {
    const stages: StageDef[] = [
      { id: 'a', dependsOn: ['b'], run: () => batch([]) },
      { id: 'b', dependsOn: ['a'], run: () => batch([]) },
    ];
    const cycle = findCycle(stages);
    expect(cycle).not.toBeNull();
    expect(cycle?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('backoffMs', () => {
  it('grows exponentially without jitter', () => {
    const p = { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 1000, jitter: false };
    expect(backoffMs(0, p)).toBe(10);
    expect(backoffMs(1, p)).toBe(20);
    expect(backoffMs(2, p)).toBe(40);
  });

  it('caps at maxDelayMs', () => {
    const p = { maxAttempts: 10, baseDelayMs: 10, maxDelayMs: 50, jitter: false };
    expect(backoffMs(10, p)).toBe(50);
  });

  it('jitter stays within bound', () => {
    const p = { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100, jitter: true };
    for (let i = 0; i < 20; i++) {
      const v = backoffMs(3, p, () => 0.999);
      expect(v).toBeLessThanOrEqual(100);
      expect(v).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('DagPipelineEngine', () => {
  const engine = new DagPipelineEngine({ sleep: () => Promise.resolve() });

  it('runs a linear pipeline propagating rows', async () => {
    const def: PipelineDef = {
      id: 'p1',
      stages: [
        { id: 'extract', run: () => batch([{ v: 1 }, { v: 2 }], 'extract') },
        {
          id: 'double',
          dependsOn: ['extract'],
          run: (ctx) => batch(ctx.inputs.get('extract')?.rows.map((r) => ({ v: (r.v as number) * 2 })) ?? [], 'double'),
        },
      ],
    };
    const report = await engine.run(def);
    expect(report.status).toBe('success');
    const out = report.outputs.get('double');
    expect(out?.rows.map((r) => r.v)).toEqual([2, 4]);
    expect(report.stages.find((s) => s.stageId === 'double')?.attempts).toBe(1);
  });

  it('runs independent stages in parallel layers', async () => {
    const order: string[] = [];
    const def: PipelineDef = {
      id: 'p2',
      stages: [
        { id: 'src', run: () => batch([{ v: 1 }], 'src') },
        { id: 'a', dependsOn: ['src'], run: () => { order.push('a'); return batch([], 'a'); } },
        { id: 'b', dependsOn: ['src'], run: () => { order.push('b'); return batch([], 'b'); } },
        { id: 'end', dependsOn: ['a', 'b'], run: () => batch([], 'end') },
      ],
    };
    const report = await engine.run(def);
    expect(report.status).toBe('success');
    expect(order.sort()).toEqual(['a', 'b']);
  });

  it('retries a flaky stage with backoff', async () => {
    let calls = 0;
    const def: PipelineDef = {
      id: 'p3',
      stages: [
        {
          id: 'flaky',
          retry: { maxAttempts: 3, baseDelayMs: 1, jitter: false },
          run: () => {
            calls++;
            if (calls < 3) throw new Error('transient');
            return batch([{ ok: true }], 'flaky');
          },
        },
      ],
    };
    const report = await engine.run(def);
    expect(report.status).toBe('success');
    expect(calls).toBe(3);
    expect(report.stages[0].attempts).toBe(3);
  });

  it('fails stage after maxAttempts and skips dependents', async () => {
    const def: PipelineDef = {
      id: 'p4',
      stages: [
        { id: 'bad', retry: { maxAttempts: 2, baseDelayMs: 1, jitter: false }, run: () => { throw new Error('always'); } },
        { id: 'down', dependsOn: ['bad'], run: () => batch([], 'down') },
        { id: 'indep', run: () => batch([{ x: 1 }], 'indep') },
      ],
    };
    const report = await engine.run(def);
    expect(report.status).toBe('partial'); // indep succeeded
    expect(report.stages.find((s) => s.stageId === 'bad')?.status).toBe('failed');
    expect(report.stages.find((s) => s.stageId === 'bad')?.attempts).toBe(2);
    expect(report.stages.find((s) => s.stageId === 'down')?.status).toBe('skipped');
    expect(report.stages.find((s) => s.stageId === 'indep')?.status).toBe('success');
  });

  it('records lineage reported by stages', async () => {
    const def: PipelineDef = {
      id: 'p5',
      stages: [
        {
          id: 'e',
          run: (ctx) => {
            ctx.reportLineage({ from: 'source.orders', to: 'e.orders', transform: 'extract' });
            return batch([{ id: 1 }], 'e');
          },
        },
        {
          id: 't',
          dependsOn: ['e'],
          run: (ctx) => {
            ctx.reportLineage({ from: 'e.orders', to: 't.big_orders', transform: 'filter amount>100' });
            return batch([], 't');
          },
        },
      ],
    };
    const report = await engine.run(def);
    expect(report.lineage.length).toBe(2);
    expect(report.lineage[1].transform).toContain('filter');
  });

  it('checkpoint records completed stages; resume skips them', async () => {
    const runCounts = new Map<string, number>();
    const mk = (id: string, deps: string[] = []): StageDef => ({
      id,
      dependsOn: deps,
      run: () => {
        runCounts.set(id, (runCounts.get(id) ?? 0) + 1);
        return batch([{ id }], id);
      },
    });
    // First run: a ok, b fails
    const def1: PipelineDef = {
      id: 'p6',
      stages: [
        mk('a'),
        { id: 'b', dependsOn: ['a'], retry: { maxAttempts: 1 }, run: () => { throw new Error('boom'); } },
        mk('c', ['b']),
      ],
    };
    const r1 = await engine.run(def1);
    expect(r1.status).toBe('partial'); // 'a' succeeded, 'b' failed
    expect(r1.checkpoint.completed.has('a')).toBe(true);

    // Resume: a skipped, b now succeeds, c runs
    const def2: PipelineDef = {
      id: 'p6',
      stages: [mk('a'), mk('b', ['a']), mk('c', ['b'])],
    };
    const r2 = await engine.run(def2, { resumeFrom: r1.checkpoint });
    expect(r2.status).toBe('success');
    expect(r2.stages.find((s) => s.stageId === 'a')?.status).toBe('skipped');
    expect(runCounts.get('a')).toBe(1); // never re-ran
    expect(runCounts.get('b')).toBe(1);
    expect(runCounts.get('c')).toBe(1);
  });

  it('respects maxConcurrency layer batching', async () => {
    const started: number[] = [];
    let concurrent = 0;
    let maxSeen = 0;
    const def: PipelineDef = {
      id: 'p7',
      maxConcurrency: 2,
      stages: Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`,
        run: async () => {
          concurrent++;
          maxSeen = Math.max(maxSeen, concurrent);
          started.push(Date.now());
          await new Promise((r) => setTimeout(r, 5));
          concurrent--;
          return batch([], `s${i}`);
        },
      })),
    };
    const report = await engine.run(def);
    expect(report.status).toBe('success');
    expect(maxSeen).toBeLessThanOrEqual(2);
  });
});
