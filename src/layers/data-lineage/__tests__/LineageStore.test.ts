/**
 * Lineage store tests: versioning, snapshots, diffs.
 */

import { describe, it, expect } from 'bun:test';
import { LineageStore, cloneGraph } from '../engine/LineageStore';

describe('LineageStore', () => {
  it('commits versions monotonically', () => {
    const s = new LineageStore();
    s.captureJob('j1', ['a'], ['b'], 'first job');
    s.captureJob('j2', ['b'], ['c'], 'second job');
    expect(s.version).toBe(2);
    expect(s.history()[0].comment).toBe('first job');
  });

  it('snapshot replays state at a version', () => {
    const s = new LineageStore();
    s.captureJob('j1', ['a'], ['b']);
    const v1 = s.version;
    s.captureJob('j2', ['b'], ['c']);
    const atV1 = s.snapshot(v1);
    expect(atV1.node('c')).toBeUndefined();
    expect(atV1.downstream('a')).toContain('b');
    expect(atV1.downstream('a')).not.toContain('c');
    // Latest has everything
    expect(s.current.downstream('a')).toContain('c');
  });

  it('diff computes added/removed nodes and edges', () => {
    const s = new LineageStore();
    s.captureJob('j1', ['a'], ['b']);
    const v1 = s.version;
    s.stage({ op: 'removeEdge', from: 'j1', to: 'b', kind: 'writes' });
    s.stage({ op: 'addNode', node: { id: 'd', kind: 'dataset', metadata: {} } });
    s.commit('remove j1→b, add d');
    const d = s.diff(v1, s.version);
    expect(d.addedNodes.map((n) => n.id)).toEqual(['d']);
    expect(d.removedEdges.length).toBe(1);
    expect(d.removedEdges[0].kind).toBe('writes');
    expect(d.addedEdges.length).toBe(0);
  });

  it('checkpoint replay produces identical graph', () => {
    const s = new LineageStore({ checkpointEvery: 2 });
    for (let i = 0; i < 6; i++) {
      s.captureJob(`j${i}`, [`src${i}`], [`dst${i}`]);
    }
    // version 6 checkpoint exists; snapshot(5) replays from cp(4)
    const snap5 = s.snapshot(5);
    expect(snap5.node('dst4')).toBeDefined();
    expect(snap5.node('j5')).toBeUndefined();
    const snap6 = s.snapshot(6);
    expect(snap6.node('j5')).toBeDefined();
  });

  it('removeNode delta drops node and its edges', () => {
    const s = new LineageStore();
    s.captureJob('j1', ['a'], ['b']);
    s.stage({ op: 'removeNode', nodeId: 'j1' });
    s.commit('remove job');
    expect(s.current.node('j1')).toBeUndefined();
    expect(s.current.edges().length).toBe(0);
  });

  it('cloneGraph produces independent copy', () => {
    const s = new LineageStore();
    s.captureJob('j1', ['a'], ['b']);
    const c = cloneGraph(s.current);
    c.addDataset('extra');
    expect(s.current.node('extra')).toBeUndefined();
    expect(c.node('extra')).toBeDefined();
  });
});
