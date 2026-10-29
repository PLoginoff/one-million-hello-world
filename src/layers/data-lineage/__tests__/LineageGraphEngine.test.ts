/**
 * Lineage graph engine tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { GraphCaptureHook, LineageGraph, extractColumnRefs } from '../engine/LineageGraphEngine';

describe('extractColumnRefs', () => {
  it('extracts simple references', () => {
    const refs = extractColumnRefs('a + b * 2');
    expect(refs.map((r) => r.name).sort()).toEqual(['a', 'b']);
  });

  it('extracts qualified references', () => {
    const refs = extractColumnRefs('orders.total + customers.tax');
    expect(refs.length).toBe(2);
    expect(refs.find((r) => r.name === 'orders.total')?.qualifier).toBe('orders');
  });

  it('skips function names and keywords', () => {
    const refs = extractColumnRefs("upper(trim(name)) || ' ' || last_name");
    expect(refs.map((r) => r.name).sort()).toEqual(['last_name', 'name']);
  });

  it('handles case expressions', () => {
    const refs = extractColumnRefs('case when x > 0 then y else z end');
    expect(refs.map((r) => r.name).sort()).toEqual(['x', 'y', 'z']);
  });

  it('skips string and number literals', () => {
    const refs = extractColumnRefs("concat(name, 'literal', 42)");
    expect(refs.map((r) => r.name)).toEqual(['name']);
  });

  it('dedupes repeated references', () => {
    const refs = extractColumnRefs('a + a + a');
    expect(refs.length).toBe(1);
  });
});

describe('LineageGraph — basics', () => {
  let g: LineageGraph;
  beforeEach(() => {
    g = new LineageGraph();
  });

  it('captureJob wires reads/writes edges', () => {
    g.captureJob('job1', ['raw.orders'], ['stg.orders']);
    expect(g.node('job1')?.kind).toBe('job');
    expect(g.outEdges('raw.orders')[0].kind).toBe('reads');
    expect(g.inEdges('stg.orders')[0].kind).toBe('writes');
  });

  it('addColumn auto-wires contains edge', () => {
    g.addDataset('d.t');
    g.addColumn('d.t', 'col1');
    expect(g.node('d.t.col1')?.kind).toBe('column');
    const contains = g.outEdges('d.t').filter((e) => e.kind === 'contains');
    expect(contains.length).toBe(1);
    expect(contains[0].to).toBe('d.t.col1');
  });
});

describe('LineageGraph — traversal', () => {
  let g: LineageGraph;
  beforeEach(() => {
    g = new LineageGraph();
    // raw.a → job1 → stg.b → job2 → mart.c
    g.captureJob('job1', ['raw.a'], ['stg.b']);
    g.captureJob('job2', ['stg.b'], ['mart.c']);
  });

  it('upstream traverses transitive inputs', () => {
    const up = g.upstream('mart.c').sort();
    expect(up).toEqual(['job1', 'job2', 'raw.a', 'stg.b']);
  });

  it('downstream traverses transitive outputs', () => {
    const down = g.downstream('raw.a').sort();
    expect(down).toEqual(['job1', 'job2', 'mart.c', 'stg.b']);
  });

  it('impact splits datasets and jobs', () => {
    const report = g.impact('raw.a');
    expect(report.affectedDatasets.sort()).toEqual(['mart.c', 'stg.b']);
    expect(report.affectedJobs.sort()).toEqual(['job1', 'job2']);
  });
});

describe('LineageGraph — column lineage', () => {
  let g: LineageGraph;
  beforeEach(() => {
    g = new LineageGraph();
    g.captureJob('etl', ['raw.orders'], ['stg.orders']);
  });

  it('resolves qualified refs to source columns', () => {
    const res = g.captureColumnLineage(
      'etl',
      'stg.orders',
      ['raw.orders'],
      new Map([['total_usd', 'orders.total * rates.usd']])
    );
    // 'orders' qualifier resolves to raw.orders; 'rates.usd' qualifier
    // doesn't match any input → unresolved for that ref? qualifier
    // 'rates' doesn't match 'raw.orders' → unresolved.
    expect(res.unresolved.length).toBe(1);
    expect(res.resolved).toBe(1);
    const edge = g.outEdges('raw.orders.total').find((e) => e.kind === 'derives');
    expect(edge?.to).toBe('stg.orders.total_usd');
    expect(edge?.expression).toContain('rates.usd');
  });

  it('unqualified ref attaches to dataset containing that column', () => {
    g.addColumn('raw.orders', 'amount');
    const res = g.captureColumnLineage('etl', 'stg.orders', ['raw.orders'], new Map([['amt2', 'amount * 2']]));
    expect(res.unresolved.length).toBe(0);
    expect(g.outEdges('raw.orders.amount').some((e) => e.to === 'stg.orders.amt2')).toBe(true);
  });

  it('columnImpact follows derives across jobs', () => {
    g.addColumn('raw.orders', 'amount');
    g.captureColumnLineage('etl', 'stg.orders', ['raw.orders'], new Map([['amt2', 'amount * 2']]));
    g.captureJob('etl2', ['stg.orders'], ['mart.orders']);
    g.addColumn('stg.orders', 'amt2');
    g.captureColumnLineage('etl2', 'mart.orders', ['stg.orders'], new Map([['amt3', 'amt2 + 1']]));
    const impacted = g.columnImpact('raw.orders.amount');
    expect(impacted).toContain('stg.orders.amt2');
    expect(impacted).toContain('mart.orders.amt3');
  });
});

describe('LineageGraph — cycles', () => {
  it('findCycle reports a cycle path', () => {
    const g = new LineageGraph();
    g.captureJob('j1', ['a'], ['b']);
    g.captureJob('j2', ['b'], ['a']); // cycle: a → j1 → b → j2 → a
    const c = g.findCycle();
    expect(c).not.toBeNull();
    expect(c?.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('acyclic graph returns null', () => {
    const g = new LineageGraph();
    g.captureJob('j1', ['a'], ['b']);
    expect(g.findCycle()).toBeNull();
  });

  it('contains edges never count as cycles', () => {
    const g = new LineageGraph();
    g.addColumn('d.t', 'c');
    expect(g.findCycle()).toBeNull();
  });
});

describe('LineageGraph — serialization', () => {
  it('round-trips nodes and edges', () => {
    const g = new LineageGraph();
    g.captureJob('j1', ['a'], ['b']);
    g.captureColumnLineage('j1', 'b', ['a'], new Map([['x', 'y + 1']]));
    const json = g.serialize();
    const g2 = LineageGraph.deserialize(json);
    expect(g2.nodeCount).toBe(g.nodeCount);
    expect(g2.edges().length).toBe(g.edges().length);
    expect(g2.downstream('a').sort()).toEqual(g.downstream('a').sort());
  });

  it('rejects unknown version', () => {
    expect(() => LineageGraph.deserialize('{"version":99,"nodes":[],"edges":[]}')).toThrow('version');
  });
});

describe('GraphCaptureHook', () => {
  it('feeds job + datasets + column derivations', () => {
    const g = new LineageGraph();
    const hook = new GraphCaptureHook(g);
    hook.jobStarted('job1');
    hook.datasetRead('job1', 'raw.a');
    hook.datasetWritten('job1', 'stg.b');
    hook.columnDerived('job1', 'stg.b', 'out', 'in_col * 3', ['raw.a']);
    hook.jobFinished('job1');

    expect(g.node('job1')).toBeDefined();
    expect(g.outEdges('raw.a')[0].kind).toBe('reads');
    expect(g.inEdges('stg.b')[0].kind).toBe('writes');
    expect(g.node('stg.b.out')?.kind).toBe('column');
  });
});
