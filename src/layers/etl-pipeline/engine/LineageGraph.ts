/**
 * Pipeline Lineage Graph
 *
 * Captures the lineage edges reported by stages into a queryable DAG:
 *
 *  - Nodes are `stageId` or `stageId.column` identifiers plus the
 *    synthetic `source`/`sink` roots.
 *  - Edges carry the transform description reported by the stage.
 *  - Queries: `upstream(node)`/`downstream(node)` transitive closures
 *    via iterative DFS — O(V+E); `paths(a,b)` enumerates derivation paths
 *    for impact analysis.
 *
 * This is the ETL-runtime-facing view; the dedicated `data-lineage`
 * layer provides the richer dataset/column-level graph.
 *
 * @module EtlPipeline/Engine
 */

import { LineageEdge } from './DagEngine';

/** A lineage graph node. */
export interface LineageNode {
  readonly id: string;
  readonly kind: 'source' | 'stage' | 'column' | 'sink';
}

function nodeKind(id: string): LineageNode['kind'] {
  if (id === 'source') return 'source';
  if (id === 'sink') return 'sink';
  return id.includes('.') ? 'column' : 'stage';
}

/**
 * Mutable lineage graph built from recorded edges.
 */
export class LineageGraph {
  private readonly _edges: LineageEdge[] = [];
  private readonly _forward = new Map<string, LineageEdge[]>();
  private readonly _backward = new Map<string, LineageEdge[]>();
  private readonly _nodes = new Map<string, LineageNode>();

  addEdge(edge: LineageEdge): void {
    this._edges.push(edge);
    const fwd = this._forward.get(edge.from);
    if (fwd === undefined) this._forward.set(edge.from, [edge]);
    else fwd.push(edge);
    const bwd = this._backward.get(edge.to);
    if (bwd === undefined) this._backward.set(edge.to, [edge]);
    else bwd.push(edge);
    if (!this._nodes.has(edge.from)) this._nodes.set(edge.from, { id: edge.from, kind: nodeKind(edge.from) });
    if (!this._nodes.has(edge.to)) this._nodes.set(edge.to, { id: edge.to, kind: nodeKind(edge.to) });
  }

  addAll(edges: readonly LineageEdge[]): void {
    for (const e of edges) this.addEdge(e);
  }

  get edges(): readonly LineageEdge[] {
    return this._edges;
  }

  get nodes(): readonly LineageNode[] {
    return [...this._nodes.values()];
  }

  /** Direct parents of a node. */
  parents(id: string): string[] {
    return (this._backward.get(id) ?? []).map((e) => e.from);
  }

  /** Direct children of a node. */
  children(id: string): string[] {
    return (this._forward.get(id) ?? []).map((e) => e.to);
  }

  /**
   * Transitive upstream closure — every node that (transitively)
   * contributed to `id`. Iterative DFS, visited-set guarded. O(V+E).
   */
  upstream(id: string): string[] {
    const seen = new Set<string>();
    const stack = this.parents(id);
    while (stack.length > 0) {
      const n = stack.pop();
      if (n === undefined || seen.has(n)) continue;
      seen.add(n);
      stack.push(...this.parents(n));
    }
    return [...seen];
  }

  /** Transitive downstream closure — impact analysis. O(V+E). */
  downstream(id: string): string[] {
    const seen = new Set<string>();
    const stack = this.children(id);
    while (stack.length > 0) {
      const n = stack.pop();
      if (n === undefined || seen.has(n)) continue;
      seen.add(n);
      stack.push(...this.children(n));
    }
    return [...seen];
  }

  /**
   * All simple paths from `from` to `to` (bounded to 64 paths /
   * depth 32 — lineage graphs are small). DFS enumeration.
   */
  paths(from: string, to: string): string[][] {
    const out: string[][] = [];
    const stack: Array<{ node: string; path: string[] }> = [{ node: from, path: [from] }];
    while (stack.length > 0 && out.length < 64) {
      const { node, path } = stack.pop() as { node: string; path: string[] };
      if (node === to) {
        out.push(path);
        continue;
      }
      if (path.length > 32) continue;
      for (const child of this.children(node)) {
        if (!path.includes(child)) stack.push({ node: child, path: [...path, child] });
      }
    }
    return out;
  }

  /** Detect any cycle reachable in the graph. */
  hasCycle(): boolean {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const visit = (id: string): boolean => {
      color.set(id, GRAY);
      for (const c of this.children(id)) {
        const cc = color.get(c) ?? WHITE;
        if (cc === GRAY) return true;
        if (cc === WHITE && visit(c)) return true;
      }
      color.set(id, BLACK);
      return false;
    };
    for (const n of this._nodes.keys()) {
      if ((color.get(n) ?? WHITE) === WHITE && visit(n)) return true;
    }
    return false;
  }

  /** Serialize to a plain JSON-friendly structure. */
  toJSON(): { nodes: LineageNode[]; edges: LineageEdge[] } {
    return { nodes: this.nodes.slice(), edges: this._edges.slice() };
  }

  /** Rebuild from serialized form. */
  static fromJSON(json: { nodes?: LineageNode[]; edges: LineageEdge[] }): LineageGraph {
    const g = new LineageGraph();
    g.addAll(json.edges);
    return g;
  }
}
