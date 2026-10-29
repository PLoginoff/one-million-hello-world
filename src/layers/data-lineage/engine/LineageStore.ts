/**
 * Lineage Store & Temporal Queries
 *
 * A versioned store on top of LineageGraph:
 *
 *  - Every mutation batch commits as a monotonically increasing version
 *    (like a database's WAL): nodes/edges added & removed recorded as
 *    deltas. A lineage *snapshot* at version V is the fold of all deltas
 *    ≤ V — so the store supports time-travel ("what did the graph look
 *    like last Tuesday?") and diffing ("what changed between v3 and v7?").
 *  - Snapshots are lazy: `snapshot(v)` replays deltas from the nearest
 *    preceding checkpoint (written every `checkpointEvery` versions).
 *  - `diff` computes added/removed/changed edges between any two
 *    versions — the lineage equivalent of `git diff`.
 *
 * @module DataLineage/Engine
 */

import { LineageEdge, LineageEdgeKind, LineageGraph, LineageNode, NodeId } from './LineageGraphEngine';

/** A single recorded mutation. */
export type LineageDelta =
  | { op: 'addNode'; node: LineageNode }
  | { op: 'removeNode'; nodeId: NodeId }
  | { op: 'addEdge'; edge: LineageEdge }
  | { op: 'removeEdge'; from: NodeId; to: NodeId; kind: LineageEdgeKind };

/** One committed version. */
export interface LineageVersion {
  readonly version: number;
  readonly at: number;
  readonly comment: string;
  readonly deltas: readonly LineageDelta[];
}

/** Structural diff between two snapshots. */
export interface GraphDiff {
  readonly addedNodes: LineageNode[];
  readonly removedNodes: NodeId[];
  readonly addedEdges: LineageEdge[];
  readonly removedEdges: LineageEdge[];
}

function edgeKey(e: { from: NodeId; to: NodeId; kind: LineageEdgeKind }): string {
  return `${e.from}→${e.to}#${e.kind}`;
}

/**
 * Versioned lineage store.
 */
export class LineageStore {
  private readonly _versions: LineageVersion[] = [];
  private readonly _checkpoints = new Map<number, LineageGraph>();
  private readonly _checkpointEvery: number;
  private _current: LineageGraph = new LineageGraph();
  private _pending: LineageDelta[] = [];

  constructor(opts: { checkpointEvery?: number } = {}) {
    this._checkpointEvery = opts.checkpointEvery ?? 10;
  }

  get version(): number {
    return this._versions.length;
  }

  get current(): LineageGraph {
    return this._current;
  }

  /* ----- writes ------------------------------------------------------- */

  /** Stage mutations; `commit` folds them into a new version. */
  stage(delta: LineageDelta): void {
    this._pending.push(delta);
  }

  stageAll(deltas: readonly LineageDelta[]): void {
    this._pending.push(...deltas);
  }

  /** Convenience: record a job capture as a staged delta batch. */
  captureJob(jobId: NodeId, reads: readonly NodeId[], writes: readonly NodeId[], comment = ''): void {
    this.stage({ op: 'addNode', node: { id: jobId, kind: 'job', metadata: {} } });
    for (const r of reads) {
      this.stage({ op: 'addNode', node: { id: r, kind: 'dataset', metadata: {} } });
      this.stage({ op: 'addEdge', edge: { from: r, to: jobId, kind: 'reads', metadata: {} } });
    }
    for (const w of writes) {
      this.stage({ op: 'addNode', node: { id: w, kind: 'dataset', metadata: {} } });
      this.stage({ op: 'addEdge', edge: { from: jobId, to: w, kind: 'writes', metadata: {} } });
    }
    this.commit(comment);
  }

  /** Fold pending deltas into the live graph and seal a version. */
  commit(comment = ''): LineageVersion {
    const version: LineageVersion = {
      version: this._versions.length + 1,
      at: Date.now(),
      comment,
      deltas: this._pending.slice(),
    };
    for (const d of this._pending) this._apply(this._current, d);
    this._pending = [];
    this._versions.push(version);
    if (version.version % this._checkpointEvery === 0) {
      this._checkpoints.set(version.version, cloneGraph(this._current));
    }
    return version;
  }

  private _apply(g: LineageGraph, d: LineageDelta): void {
    switch (d.op) {
      case 'addNode':
        g.addNode(d.node);
        break;
      case 'removeNode':
        g.removeNode(d.nodeId);
        break;
      case 'addEdge':
        g.addEdge(d.edge);
        break;
      case 'removeEdge':
        g.removeEdge(d.from, d.to, d.kind);
        break;
    }
  }

  /* ----- reads -------------------------------------------------------- */

  /** Snapshot at version v (default: latest). O(deltas since checkpoint). */
  snapshot(version?: number): LineageGraph {
    const v = version ?? this._versions.length;
    if (v === this._versions.length) return this._current;
    // Find nearest checkpoint ≤ v.
    let base: LineageGraph = new LineageGraph();
    let start = 0;
    let bestCp = -1;
    for (const cv of this._checkpoints.keys()) {
      if (cv <= v && cv > bestCp) bestCp = cv;
    }
    if (bestCp >= 0) {
      base = cloneGraph(this._checkpoints.get(bestCp) as LineageGraph);
      start = bestCp;
    }
    for (let i = start; i < v && i < this._versions.length; i++) {
      for (const d of this._versions[i].deltas) this._apply(base, d);
    }
    return base;
  }

  /** All recorded versions (metadata only). */
  history(): readonly LineageVersion[] {
    return this._versions;
  }

  /**
   * Structural diff between versions a (older) and b (newer).
   * Computed on the snapshots — compares node sets and edge sets.
   */
  diff(a: number, b: number): GraphDiff {
    const ga = this.snapshot(a);
    const gb = this.snapshot(b);
    const aNodes = new Map(ga.toJSON().nodes.map((n) => [n.id, n]));
    const bNodes = new Map(gb.toJSON().nodes.map((n) => [n.id, n]));
    const addedNodes: LineageNode[] = [];
    const removedNodes: NodeId[] = [];
    for (const [id, n] of bNodes) if (!aNodes.has(id)) addedNodes.push(n);
    for (const id of aNodes.keys()) if (!bNodes.has(id)) removedNodes.push(id);
    const aEdges = new Set(ga.edges().map(edgeKey));
    const bEdges = new Set(gb.edges().map(edgeKey));
    const addedEdges: LineageEdge[] = gb.edges().filter((e) => !aEdges.has(edgeKey(e)));
    const removedEdges: LineageEdge[] = ga.edges().filter((e) => !bEdges.has(edgeKey(e)));
    return { addedNodes, removedNodes, addedEdges, removedEdges };
  }
}

/* ------------------------------------------------------------------------ */
/* Graph cloning & edge removal                                             */
/* ------------------------------------------------------------------------ */

/** Deep-ish clone: new graph with same nodes/edges. */
export function cloneGraph(g: LineageGraph): LineageGraph {
  const c = new LineageGraph();
  for (const n of g.toJSON().nodes) c.addNode({ ...n, metadata: { ...n.metadata } });
  for (const e of g.edges()) c.addEdge({ ...e, metadata: { ...e.metadata } });
  return c;
}
