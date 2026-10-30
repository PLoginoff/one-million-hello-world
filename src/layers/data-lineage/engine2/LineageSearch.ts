/**
 * Lineage Search — find paths between two datasets
 *
 * The base `traverse` returns a distance map. This engine answers the
 * harder question — *how* is dataset A connected to dataset B? — with
 * two algorithms:
 *
 *   - **Shortest path** (BFS): the minimal-hop route A → B. O(V+E).
 *   - **All simple paths** (bounded DFS): every distinct route up to a
 *     depth bound — for questions like "show me every way raw_events
 *     reaches the executive dashboard". Exponential in the worst case,
 *     so the bound and a result cap are enforced.
 *
 * Search works in both directions (`down` follows edges, `up` reverses
 * them) and can restrict edge kinds — e.g. only data-flow edges
 * (`reads`, `writes`, `derives`) and not `contains` containment.
 *
 * @module DataLineage/Engine2
 */

import { LineageEdge, LineageGraph, LineageNode, NodeId } from '../engine/LineageGraphEngine';

/** A path through the lineage graph. */
export interface LineagePath {
  readonly nodes: readonly NodeId[];
  readonly edges: readonly LineageEdge[];
  readonly length: number;
}

/** Search direction. */
export type SearchDirection = 'up' | 'down';

/** Options for path search. */
export interface SearchOptions {
  readonly direction?: SearchDirection;
  /** Max hops to explore. Default 10. */
  readonly maxDepth: number;
  /** Edge kinds to traverse. Default all. */
  readonly edgeKinds?: readonly LineageEdge['kind'][];
  /** Cap on returned paths (all-paths mode). Default 100. */
  readonly maxPaths: number;
  /** When true, only return paths that reach `to` — prune dead ends early. */
  readonly onlyCompletePaths: boolean;
}

const DEFAULT_SEARCH: SearchOptions = {
  maxDepth: 10,
  maxPaths: 100,
  onlyCompletePaths: true,
};

/**
 * LineageSearch — path finding between datasets.
 */
export class LineageSearch {
  private readonly _g: LineageGraph;

  constructor(graph: LineageGraph) {
    this._g = graph;
  }

  /**
   * Shortest path from → to, or null when disconnected.
   * BFS — optimal for unweighted edges. O(V+E).
   */
  shortestPath(from: NodeId, to: NodeId, opts: Partial<SearchOptions> = {}): LineagePath | null {
    const cfg = { ...DEFAULT_SEARCH, ...opts };
    const depth = new Map<NodeId, number>([[from, 0]]);
    const parent = new Map<NodeId, { node: NodeId; edge: LineageEdge }>();
    const queue: NodeId[] = [from];

    while (queue.length > 0) {
      const cur = queue.shift() as NodeId;
      const d = depth.get(cur) as number;
      if (d >= cfg.maxDepth) continue;
      for (const e of this._out(cur, cfg)) {
        const next = cfg.direction === 'up' ? e.from : e.to;
        if (!depth.has(next)) {
          depth.set(next, d + 1);
          parent.set(next, { node: cur, edge: e });
          if (next === to) {
            return this._buildPath(from, to, parent);
          }
          queue.push(next);
        }
      }
    }
    return null;
  }

  /**
   * All simple paths from → to up to maxDepth, capped at maxPaths.
   * DFS with cycle detection via the current path set — the standard
   * bounded-path enumeration used in lineage UIs.
   */
  allPaths(from: NodeId, to: NodeId, opts: Partial<SearchOptions> = {}): LineagePath[] {
    const cfg = { ...DEFAULT_SEARCH, ...opts };
    const out: LineagePath[] = [];
    const nodes: NodeId[] = [from];
    const edges: LineageEdge[] = [];
    const onPath = new Set<NodeId>([from]);

    const dfs = (cur: NodeId): void => {
      if (out.length >= cfg.maxPaths) return;
      if (cur === to) {
        out.push({ nodes: [...nodes], edges: [...edges], length: edges.length });
        return;
      }
      if (nodes.length - 1 >= cfg.maxDepth) return;
      for (const e of this._out(cur, cfg)) {
        const next = cfg.direction === 'up' ? e.from : e.to;
        if (onPath.has(next)) continue; // simple paths only
        onPath.add(next);
        nodes.push(next);
        edges.push(e);
        dfs(next);
        edges.pop();
        nodes.pop();
        onPath.delete(next);
      }
    };
    dfs(from);
    return out;
  }

  /**
   * Does a path exist at all between the two nodes? Short-circuit BFS.
   */
  connected(from: NodeId, to: NodeId, opts: Partial<SearchOptions> = {}): boolean {
    return this.shortestPath(from, to, opts) !== null;
  }

  /**
   * Which nodes lie on *any* shortest path between two nodes — the
   * "pinch points" whose removal would disconnect them. Uses the
   * classic BFS-from-both-ends intersection trick: a node v is on a
   * shortest path iff dist(from,v) + dist(v,to) == dist(from,to).
   */
  articulationPoints(from: NodeId, to: NodeId, opts: Partial<SearchOptions> = {}): NodeId[] {
    const cfg = { ...DEFAULT_SEARCH, ...opts };
    const fromDist = this._distances(from, cfg);
    const toDist = this._distancesTo(to, cfg);
    const shortest = fromDist.get(to);
    if (shortest === undefined) return [];
    const out: NodeId[] = [];
    for (const [id, d1] of fromDist) {
      const d2 = toDist.get(id);
      if (d2 !== undefined && d1 + d2 === shortest && id !== from && id !== to) {
        out.push(id);
      }
    }
    return out;
  }

  /* ----- internals ------------------------------------------------------ */

  private _out(id: NodeId, cfg: SearchOptions): readonly LineageEdge[] {
    const edges = cfg.direction === 'up' ? this._g.inEdges(id) : this._g.outEdges(id);
    if (cfg.edgeKinds === undefined) return edges;
    return edges.filter((e) => cfg.edgeKinds?.includes(e.kind));
  }

  private _buildPath(
    from: NodeId,
    to: NodeId,
    parent: ReadonlyMap<NodeId, { node: NodeId; edge: LineageEdge }>
  ): LineagePath {
    const nodes: NodeId[] = [to];
    const edges: LineageEdge[] = [];
    let cur = to;
    while (cur !== from) {
      const p = parent.get(cur);
      if (p === undefined) break;
      edges.unshift(p.edge);
      nodes.unshift(p.node);
      cur = p.node;
    }
    return { nodes, edges, length: edges.length };
  }

  private _distances(from: NodeId, cfg: SearchOptions): Map<NodeId, number> {
    const dist = new Map<NodeId, number>([[from, 0]]);
    const queue: NodeId[] = [from];
    while (queue.length > 0) {
      const cur = queue.shift() as NodeId;
      const d = dist.get(cur) as number;
      if (d >= cfg.maxDepth) continue;
      for (const e of this._out(cur, cfg)) {
        const next = cfg.direction === 'up' ? e.from : e.to;
        if (!dist.has(next)) {
          dist.set(next, d + 1);
          queue.push(next);
        }
      }
    }
    return dist;
  }

  /** Distances *to* a node — BFS on the reversed adjacency. */
  private _distancesTo(to: NodeId, cfg: SearchOptions): Map<NodeId, number> {
    const dist = new Map<NodeId, number>([[to, 0]]);
    const queue: NodeId[] = [to];
    while (queue.length > 0) {
      const cur = queue.shift() as NodeId;
      const d = dist.get(cur) as number;
      if (d >= cfg.maxDepth) continue;
      // Reverse of _out: in 'down' mode we follow in-edges (predecessors).
      const edges = cfg.direction === 'up' ? this._g.outEdges(cur) : this._g.inEdges(cur);
      for (const e of edges) {
        if (cfg.edgeKinds !== undefined && !cfg.edgeKinds.includes(e.kind)) continue;
        const prev = cfg.direction === 'up' ? e.to : e.from;
        if (!dist.has(prev)) {
          dist.set(prev, d + 1);
          queue.push(prev);
        }
      }
    }
    return dist;
  }
}
