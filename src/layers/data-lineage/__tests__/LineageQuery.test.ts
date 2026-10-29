/**
 * Lineage query & root-cause tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LineageGraph } from '../engine/LineageGraphEngine';
import { LineageQuery, RootCauseAnalyzer } from '../engine/LineageQuery';

let g: LineageGraph;

beforeEach(() => {
  g = new LineageGraph();
  // raw.a ─j1→ stg.b ─j2→ mart.c
  //            stg.b ─j3→ mart.d
  g.captureJob('j1', ['raw.a'], ['stg.b']);
  g.captureJob('j2', ['stg.b'], ['mart.c']);
  g.captureJob('j3', ['stg.b'], ['mart.d']);
});

describe('LineageQuery', () => {
  it('nodes() filters by kind', () => {
    const q = new LineageQuery(g);
    expect(q.nodes({ kind: 'job' }).map((n) => n.id).sort()).toEqual(['j1', 'j2', 'j3']);
    expect(q.nodes({ kind: 'dataset' }).length).toBe(4);
  });

  it('nodes() filters by id glob', () => {
    const q = new LineageQuery(g);
    const marts = q.nodes({ idPattern: 'mart.*' });
    expect(marts.length).toBe(2);
  });

  it('sources() and sinks()', () => {
    const q = new LineageQuery(g);
    expect(q.sources().map((n) => n.id)).toEqual(['raw.a']);
    expect(q.sinks().map((n) => n.id).sort()).toEqual(['mart.c', 'mart.d']);
  });

  it('subgraph extracts bounded neighborhood', () => {
    const q = new LineageQuery(g);
    const sub = q.subgraph('stg.b', { direction: 'down', depth: 2 });
    const ids = sub.toJSON().nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['j2', 'j3', 'mart.c', 'mart.d', 'stg.b']);
    expect(sub.toJSON().edges.length).toBe(4);
  });

  it('subgraph depth=1 includes only direct neighbors', () => {
    const q = new LineageQuery(g);
    const sub = q.subgraph('stg.b', { direction: 'down', depth: 1 });
    const ids = sub.toJSON().nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['j2', 'j3', 'stg.b']);
  });

  it('subgraph direction=up includes upstream only', () => {
    const q = new LineageQuery(g);
    const sub = q.subgraph('stg.b', { direction: 'up' });
    expect(sub.node('j1')).toBeDefined();
    expect(sub.node('raw.a')).toBeDefined();
    expect(sub.node('mart.c')).toBeUndefined();
  });

  it('orphans() finds unconnected nodes', () => {
    g.addDataset('lonely');
    const q = new LineageQuery(g);
    expect(q.orphans().map((n) => n.id)).toEqual(['lonely']);
  });
});

describe('RootCauseAnalyzer', () => {
  it('ranks the shared upstream as top candidate', () => {
    const analyzer = new RootCauseAnalyzer(g);
    const report = analyzer.analyze('mart.c');
    // blast radius of mart.c: nothing downstream → symptom itself excluded; terminal = none.
    // Try symptom at stg.b level instead:
    const report2 = analyzer.analyze('stg.b');
    expect(report2.blastRadius.sort()).toEqual(['mart.c', 'mart.d']);
    // j1, raw.a, j2/j3? upstream of stg.b = j1, raw.a. Both reach both
    // marts → score 2; j1 closer → first.
    expect(report2.candidates[0].score).toBe(2);
    expect(report2.candidates[0].nodeId).toBe('j1');
    void report;
  });

  it('blast radius terminals are sinks', () => {
    const analyzer = new RootCauseAnalyzer(g);
    const report = analyzer.analyze('raw.a');
    expect(report.blastRadius.sort()).toEqual(['mart.c', 'mart.d']);
  });
});
