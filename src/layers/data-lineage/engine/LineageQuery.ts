/**
 * Lineage Query & Root-Cause Analysis
 *
 * Two higher-level services over the LineageGraph:
 *
 * LineageQuery
 * ------------
 * A small predicate-based query API for slicing the graph:
 *   - `query.nodes(where)` — filter by kind/metadata/id-glob.
 *   - `query.subgraph(seed, {depth, direction, edgeKinds})` — extract a
 *     bounded neighborhood as a standalone LineageGraph (for rendering
 *     or exporting a blast-radius view).
 *   - `query.sources()`/`sinks()` — graph roots/leaves (datasets with no
 *     upstream producers / no downstream consumers).
 *   - `query.orphans()` — columns/datasets with no lineage at all.
 *
 * RootCauseAnalyzer
 * -----------------
 * Given a "symptom" node (a column reported bad downstream), walk its
 * upstream chain and rank candidate root causes by fan-out: the node
 * whose subtree contains the most *affected* terminals is the most
 * likely culprit — a simplified version of how lineage-driven incident
 * tools (Monte Carlo, OpenLineage marquez) triage data incidents.
 *
 * @module DataLineage/Engine
 */

import { LineageEdge, LineageEdgeKind, LineageGraph, LineageNode, LineageNodeKind, NodeId } from './LineageGraphEngine';

/** Node filter for queries. */
export interface NodeFilter {
  readonly kind?: LineageNodeKind;
  /** Glob-style match: `*` wildcard (e.g. `mart.*`). */
  readonly idPattern?: string;
  /** Metadata equality. */
  readonly metadataEquals?: Record<string, unknown>;
  readonly predicate?: (n: LineageNode) => boolean;
}

function globToRegex(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`);
}

function matches(n: LineageNode, f: NodeFilter): boolean {
  if (f.kind !== undefined && n.kind !== f.kind) return false;
  if (f.idPattern !== undefined && !globToRegex(f.idPattern).test(n.id)) return false;
  if (f.metadataEquals !== undefined) {
    for (const [k, v] of Object.entries(f.metadataEquals)) {
      if (n.metadata[k] !== v) return false;
    }
  }
  if (f.predicate !== undefined && !f.predicate(n)) return false;
  return true;
}

/** Options for subgraph extraction. */
export interface SubgraphOptions {
  readonly direction?: 'up' | 'down' | 'both';
  /** Max BFS depth (default unlimited). */
  readonly depth?: number;
  readonly edgeKinds?: readonly LineageEdgeKind[];
}

/** Query facade over a graph. */
export class LineageQuery {
  private readonly _g: LineageGraph;

  constructor(graph: LineageGraph) {
    this._g = graph;
  }

  /** All nodes matching the filter. */
  nodes(filter: NodeFilter = {}): LineageNode[] {
    return this._g.toJSON().nodes.filter((n) => matches(n, filter));
  }

  /** Datasets nobody produces (graph roots). */
  sources(): LineageNode[] {
    return this._g.toJSON().nodes.filter((n) => {
      if (n.kind !== 'dataset') return false;
      return this._g.inEdges(n.id).filter((e) => e.kind === 'writes').length === 0;
    });
  }

  /** Datasets nobody consumes (graph leaves). */
  sinks(): LineageNode[] {
    return this._g.toJSON().nodes.filter((n) => {
      if (n.kind !== 'dataset') return false;
      return this._g.outEdges(n.id).filter((e) => e.kind === 'reads').length === 0;
    });
  }

  /** Nodes with zero lineage edges of any kind. */
  orphans(): LineageNode[] {
    return this._g.toJSON().nodes.filter((n) => this._g.edges(n.id).length === 0);
  }

  /**
   * Extract a bounded neighborhood as a fresh graph — nodes within
   * `depth` hops in the requested direction(s) plus all edges between
   * included nodes (so the result is internally consistent for
   * serialization).
   */
  subgraph(seed: NodeId, opts: SubgraphOptions = {}): LineageGraph {
    const direction = opts.direction ?? 'both';
    const included = new Map<NodeId, number>();
    if (direction === 'up' || direction === 'both') {
      for (const [id, d] of this._g.traverse(seed, 'up', opts.edgeKinds).nodes) {
        if (opts.depth === undefined || d <= opts.depth) included.set(id, d);
      }
    }
    if (direction === 'down' || direction === 'both') {
      for (const [id, d] of this._g.traverse(seed, 'down', opts.edgeKinds).nodes) {
        if (opts.depth === undefined || d <= opts.depth) included.set(id, d);
      }
    }
    const out = new LineageGraph();
    for (const id of included.keys()) {
      const n = this._g.node(id);
      if (n !== undefined) out.addNode({ ...n, metadata: { ...n.metadata } });
    }
    for (const e of this._g.edges()) {
      if (included.has(e.from) && included.has(e.to)) {
        out.addEdge({ ...e, metadata: { ...e.metadata } });
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------------ */
/* Root-cause analysis                                                      */
/* ------------------------------------------------------------------------ */

/** A candidate root cause ranked by explanatory fan-out. */
export interface RootCauseCandidate {
  readonly nodeId: NodeId;
  readonly kind: LineageNodeKind;
  /**
   * Score = number of affected terminal nodes (downstream datasets/columns
   * with no further downstream) reachable from this candidate. The
   * upstream node explaining the most symptoms ranks first.
   */
  readonly score: number;
  /** BFS distance upstream from the symptom. */
  readonly distance: number;
}

/** Root-cause report. */
export interface RootCauseReport {
  readonly symptom: NodeId;
  readonly candidates: RootCauseCandidate[];
  /** Terminal nodes in the symptom's downstream (the "blast radius"). */
  readonly blastRadius: NodeId[];
}

/**
 * Ranks upstream candidates for a symptom node.
 *
 * Algorithm:
 *  1. Compute the symptom's blast radius: terminal nodes (no outgoing
 *     reads/derives) in its downstream.
 *  2. Walk upstream ancestors BFS; each ancestor's score = blast-radius
 *     members reachable from it — i.e. how much of the visible damage it
 *     could explain. Pure pass-through ancestors (score == blastRadius)
 *     are indistinguishable from their parents; the analyzer prefers
 *     the *shallowest* maximal scorer by sorting (score desc, distance asc).
 */
export class RootCauseAnalyzer {
  private readonly _g: LineageGraph;

  constructor(graph: LineageGraph) {
    this._g = graph;
  }

  analyze(symptom: NodeId): RootCauseReport {
    const downstream = this._g.traverse(symptom, 'down', ['reads', 'writes', 'derives', 'contains']).nodes;
    // Terminals: downstream nodes with no further out-edges of lineage kinds.
    const blastRadius: NodeId[] = [];
    for (const id of downstream.keys()) {
      if (id === symptom) continue;
      const outs = this._g.outEdges(id).filter((e) => e.kind !== 'contains');
      if (outs.length === 0) blastRadius.push(id);
    }
    const blastSet = new Set(blastRadius);

    const ancestors = this._g.traverse(symptom, 'up', ['reads', 'writes', 'derives']).nodes;
    const candidates: RootCauseCandidate[] = [];
    for (const [id, dist] of ancestors) {
      if (id === symptom) continue;
      const reach = this._g.traverse(id, 'down', ['reads', 'writes', 'derives', 'contains']).nodes;
      let score = 0;
      for (const b of blastSet) if (reach.has(b)) score++;
      const node = this._g.node(id);
      candidates.push({ nodeId: id, kind: node?.kind ?? 'dataset', score, distance: dist });
    }
    candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);
    return { symptom, candidates, blastRadius };
  }
}
