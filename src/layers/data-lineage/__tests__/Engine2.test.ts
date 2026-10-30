/**
 * Data Lineage Engine2 — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { LineageGraph } from '../engine/LineageGraphEngine';
import { ImpactAnalyzer, Criticality } from '../engine2/ImpactAnalysis';
import { LineageSearch } from '../engine2/LineageSearch';
import { LineageDiffer } from '../engine2/LineageDiff';
import { classifyExpression, ColumnPropagator, TransformKind } from '../engine2/ColumnPropagation';

function pipelineGraph(): LineageGraph {
  const g = new LineageGraph();
  // raw.events → job1 → staging.events → job2 → mart.daily → job3 → report.exec
  g.captureJob('job1', ['raw.events'], ['staging.events']);
  g.captureJob('job2', ['staging.events'], ['mart.daily']);
  g.captureJob('job3', ['mart.daily'], ['report.exec']);
  // side branch: staging.events → jobX → sandbox.debug
  g.captureJob('jobX', ['staging.events'], ['sandbox.debug']);
  return g;
}

/* ----------------------------------------------------------------------- */
/* ImpactAnalyzer                                                          */
/* ----------------------------------------------------------------------- */

describe('ImpactAnalyzer', () => {
  it('computes full downstream blast radius', () => {
    const g = pipelineGraph();
    const a = new ImpactAnalyzer(g);
    const r = a.analyze('raw.events');
    expect(r.totalAffected).toBeGreaterThan(0);
    const ids = r.ranked.map((i) => i.node.id);
    expect(ids).toContain('staging.events');
    expect(ids).toContain('mart.daily');
    expect(ids).toContain('report.exec');
    expect(ids).toContain('sandbox.debug');
  });

  it('respects maxDepth', () => {
    const g = pipelineGraph();
    const a = new ImpactAnalyzer(g, { maxDepth: 2 });
    const r = a.analyze('raw.events');
    const depths = r.ranked.map((i) => i.depth);
    expect(Math.max(...depths)).toBeLessThanOrEqual(2);
    expect(r.ranked.some((i) => i.node.id === 'job1')).toBe(true);
    expect(r.ranked.some((i) => i.node.id === 'staging.events')).toBe(true);
    // job3 (depth 5) is out of range.
    expect(r.ranked.some((i) => i.node.id === 'job3')).toBe(false);
  });

  it('criticality weights rank critical nodes first', () => {
    const g = new LineageGraph();
    g.addDataset('raw.a');
    g.addDataset('low.deep');
    g.addDataset('high.deep');
    g.addNode({ id: 'low.deep', kind: 'dataset', metadata: { criticality: 'low' } });
    g.addNode({ id: 'high.deep', kind: 'dataset', metadata: { criticality: 'high' } });
    // deep nodes at the same depth; 'high' should outrank 'low'.
    g.addEdge({ from: 'raw.a', to: 'low.deep', kind: 'reads', metadata: {} });
    g.addEdge({ from: 'raw.a', to: 'high.deep', kind: 'reads', metadata: {} });
    const a = new ImpactAnalyzer(g);
    const r = a.analyze('raw.a');
    const crit = r.criticalityCounts;
    expect(crit[Criticality.HIGH]).toBe(1);
    expect(crit[Criticality.LOW]).toBe(1);
    expect(r.ranked[0].criticality).toBe(Criticality.HIGH);
  });

  it('materialises propagation paths', () => {
    const g = pipelineGraph();
    const a = new ImpactAnalyzer(g);
    const r = a.analyze('raw.events');
    const reportPath = r.ranked.find((i) => i.node.id === 'report.exec')?.path;
    expect(reportPath).toBeDefined();
    expect(reportPath![0]).toBe('raw.events');
    expect(reportPath![reportPath!.length - 1]).toBe('report.exec');
    expect(reportPath).toContain('mart.daily');
  });

  it('narrative produces readable text', () => {
    const g = pipelineGraph();
    const a = new ImpactAnalyzer(g);
    const text = a.narrative(a.analyze('raw.events'));
    expect(text).toContain('Impact of raw.events');
    expect(text).toContain('ring-');
  });
});

/* ----------------------------------------------------------------------- */
/* LineageSearch                                                           */
/* ----------------------------------------------------------------------- */

describe('LineageSearch', () => {
  it('finds the shortest path between datasets', () => {
    const g = pipelineGraph();
    const s = new LineageSearch(g);
    const p = s.shortestPath('raw.events', 'report.exec');
    expect(p).not.toBeNull();
    expect(p!.nodes[0]).toBe('raw.events');
    expect(p!.nodes[p!.nodes.length - 1]).toBe('report.exec');
    // shortest = via job chain, not the sandbox branch
    expect(p!.length).toBe(6); // raw→job1→staging→job2→mart→job3→report
  });

  it('returns null when disconnected', () => {
    const g = pipelineGraph();
    const s = new LineageSearch(g);
    expect(s.shortestPath('sandbox.debug', 'report.exec')).toBeNull();
  });

  it('allPaths enumerates every route', () => {
    const g = new LineageGraph();
    g.captureJob('j1', ['a'], ['m1', 'm2']);
    g.captureJob('j2', ['m1'], ['z']);
    g.captureJob('j3', ['m2'], ['z']);
    const s = new LineageSearch(g);
    const paths = s.allPaths('a', 'z');
    // Two paths: a→j1→m1→j2→z and a→j1→m2→j3→z.
    expect(paths.length).toBe(2);
    expect(paths.map((p) => p.nodes.join('>'))).toContain('a>j1>m1>j2>z');
    expect(paths.map((p) => p.nodes.join('>'))).toContain('a>j1>m2>j3>z');
  });

  it('respects maxDepth bound', () => {
    const g = pipelineGraph();
    const s = new LineageSearch(g);
    const p = s.shortestPath('raw.events', 'report.exec', { maxDepth: 3 });
    expect(p).toBeNull(); // needs 6 hops
  });

  it('connected() short-circuits', () => {
    const g = pipelineGraph();
    const s = new LineageSearch(g);
    expect(s.connected('raw.events', 'mart.daily')).toBe(true);
    expect(s.connected('sandbox.debug', 'report.exec')).toBe(false);
  });

  it('articulationPoints finds nodes on shortest paths', () => {
    const g = pipelineGraph();
    const s = new LineageSearch(g);
    const pts = s.articulationPoints('raw.events', 'report.exec');
    // The chain is linear — every intermediate node is on the shortest path.
    expect(pts).toContain('staging.events');
    expect(pts).toContain('mart.daily');
  });

  it('searches upstream when direction=up', () => {
    const g = pipelineGraph();
    const s = new LineageSearch(g);
    const p = s.shortestPath('report.exec', 'raw.events', { direction: 'up' });
    expect(p).not.toBeNull();
    expect(p!.nodes[p!.nodes.length - 1]).toBe('raw.events');
  });
});

/* ----------------------------------------------------------------------- */
/* LineageDiffer                                                           */
/* ----------------------------------------------------------------------- */

describe('LineageDiffer', () => {
  function g1(): LineageGraph {
    const g = new LineageGraph();
    g.captureJob('job1', ['raw.a'], ['staging.a']);
    g.captureJob('job2', ['staging.a'], ['mart.a']);
    return g;
  }

  it('detects added/removed nodes and edges', () => {
    const d = new LineageDiffer();
    const old = g1();
    const g = new LineageGraph();
    g.captureJob('job1', ['raw.a'], ['staging.a']);
    g.captureJob('job2', ['staging.a'], ['mart.a']);
    g.captureJob('job4', ['raw.b'], ['staging.b']); // new pipeline
    const diff = d.diff(old, g);
    expect(diff.addedNodes.map((n) => n.id)).toContain('staging.b');
    expect(diff.removedNodes.length).toBe(0);
    expect(diff.addedEdges.length).toBeGreaterThan(0);
  });

  it('detects rewired edges (kind change)', () => {
    const d = new LineageDiffer();
    const old = new LineageGraph();
    old.addEdge({ from: 'a', to: 'b', kind: 'reads', metadata: {} });
    const now = new LineageGraph();
    now.addEdge({ from: 'a', to: 'b', kind: 'derives', metadata: {} });
    const diff = d.diff(old, now);
    expect(diff.rewired.length).toBe(1);
    expect(diff.rewired[0].oldKind).toBe('reads');
    expect(diff.rewired[0].newKind).toBe('derives');
  });

  it('flags orphaned pipelines when upstream removed', () => {
    const d = new LineageDiffer();
    const old = g1();
    const now = new LineageGraph();
    // mart.a now reads nothing — upstream chain dropped.
    now.captureJob('job1', ['raw.a'], ['staging.a']);
    now.addDataset('mart.a');
    const diff = d.diff(old, now);
    const mart = diff.affectedPipelines.find((p) => p.datasetId === 'mart.a');
    expect(mart).toBeDefined();
    expect(mart!.orphaned).toBe(true);
  });

  it('breakingEdges marks removals that still feed live nodes', () => {
    const d = new LineageDiffer();
    const old = new LineageGraph();
    old.captureJob('job1', ['raw.a'], ['staging.a']);
    old.captureJob('job2', ['staging.a'], ['mart.a']);
    const now = new LineageGraph();
    // All nodes survive, but job1→staging.a and staging.a→job2 edges are
    // dropped while job2 still writes mart.a — a breaking removal.
    for (const n of old.toJSON().nodes) now.addNode({ ...n, metadata: { ...n.metadata } });
    now.captureJob('job2', ['staging.a'], ['mart.a']);
    const diff = d.diff(old, now);
    expect(diff.removedEdges.length).toBeGreaterThan(0);
    expect(diff.breakingEdges.length).toBeGreaterThan(0);
  });

  it('summary text aggregates the diff', () => {
    const d = new LineageDiffer();
    const diff = d.diff(g1(), new LineageGraph());
    expect(diff.summary).toContain('nodes');
    expect(diff.summary).toContain('edges');
  });
});

/* ----------------------------------------------------------------------- */
/* ColumnPropagator                                                        */
/* ----------------------------------------------------------------------- */

describe('ColumnPropagator', () => {
  it('classifies direct expressions', () => {
    expect(classifyExpression('a + b').transform).toBe(TransformKind.DIRECT);
    expect(classifyExpression('UPPER(name)').transform).toBe(TransformKind.DIRECT);
  });

  it('classifies aggregates', () => {
    expect(classifyExpression('SUM(amount)').transform).toBe(TransformKind.AGGREGATE);
    expect(classifyExpression('COUNT(*)').transform).toBe(TransformKind.AGGREGATE);
    const s = classifyExpression('AVG(x) + SUM(y)');
    expect(s.aggregateFns).toContain('avg');
    expect(s.aggregateFns).toContain('sum');
  });

  it('classifies conditionals and records branches', () => {
    const s = classifyExpression('CASE WHEN x > 0 THEN a ELSE b END');
    expect(s.transform).toBe(TransformKind.CONDITIONAL);
    const labels = s.branches.map((b) => b.label);
    expect(labels).toContain('when-cond');
    expect(labels).toContain('when-value');
    expect(labels).toContain('else');
  });

  it('classifies casts', () => {
    expect(classifyExpression('CAST(x AS INT)').transform).toBe(TransformKind.CAST);
  });

  it('classifies unions', () => {
    expect(classifyExpression('a UNION b').transform).toBe(TransformKind.UNION);
  });

  it('propagates refs to target column with transforms', () => {
    const g = new LineageGraph();
    g.addColumn('src.orders', 'amount');
    g.addColumn('src.orders', 'tax');
    g.addColumn('mart.invoice', 'total');
    const p = new ColumnPropagator(g);
    const res = p.propagate('mart.invoice', 'total', 'src.orders.amount + src.orders.tax', ['src.orders']);
    expect(res.transform).toBe(TransformKind.DIRECT);
    expect(res.edges.length).toBe(2);
    expect(res.unresolved.length).toBe(0);
    expect(res.edges.every((e) => e.resolvedFrom !== null)).toBe(true);
  });

  it('flags unresolved refs', () => {
    const g = new LineageGraph();
    g.addColumn('src.orders', 'amount');
    const p = new ColumnPropagator(g);
    const res = p.propagate('mart.invoice', 'total', 'src.orders.amount + src.orders.mystery', ['src.orders']);
    expect(res.unresolved).toContain('src.orders.mystery');
  });

  it('apply writes derives edges with transform metadata', () => {
    const g = new LineageGraph();
    g.addDataset('src.orders');
    g.addDataset('mart.invoice');
    g.addColumn('src.orders', 'amount');
    const p = new ColumnPropagator(g);
    const res = p.propagate('mart.invoice', 'total', 'SUM(src.orders.amount)', ['src.orders']);
    p.apply([res], 'etl-job');
    const colId = 'mart.invoice.total';
    const edges = g.inEdges(colId).filter((e) => e.kind === 'derives');
    expect(edges.length).toBe(1);
    expect(edges[0].metadata.transform).toBe(TransformKind.AGGREGATE);
    expect(edges[0].metadata.job).toBe('etl-job');
  });

  it('propagateSelect handles a full select list', () => {
    const g = new LineageGraph();
    g.addColumn('src.a', 'x');
    g.addColumn('src.a', 'y');
    const p = new ColumnPropagator(g);
    const res = p.propagateSelect(
      'mart.t',
      [
        { output: 'x_copy', expr: 'src.a.x' },
        { output: 'total', expr: 'SUM(src.a.y)' },
      ],
      ['src.a']
    );
    expect(res.length).toBe(2);
    expect(res[0].transform).toBe(TransformKind.DIRECT);
    expect(res[1].transform).toBe(TransformKind.AGGREGATE);
  });
});
