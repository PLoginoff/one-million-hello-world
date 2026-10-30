/**
 * FraudGraph — entity-linkage graph with fraud-ring detection.
 *
 * `LinkAnalyzer` finds *clusters sharing one attribute*. Real rings
 * are transitive: user A shares a device with B, B shares a card
 * with C — A and C share nothing directly but belong to the same
 * ring. That needs a graph, not per-attribute grouping.
 *
 * Model: bipartite-ish undirected graph
 *   user ↔ {device, card, ip, address}
 * edges are "used by". A fraud ring = a connected component with
 * ≥2 users; ring risk scales with member count, shared-attribute
 * count, and *depth* (longest shortest user↔user path — deeper
 * chains indicate deliberate layering rather than a shared
 * family computer, which is star-shaped depth=2).
 *
 * Incremental: `addEdge` unions nodes; ring queries run BFS from a
 * seed user. No global recompute per transaction.
 *
 * @module FraudDetectionLayer/Engine
 */

import {
  FraudRingResult,
  GraphNode,
  GraphNodeKind,
} from './types';

/** node key → adjacency set of node keys */
type Adj = Map<string, Set<string>>;

function key(kind: GraphNodeKind, id: string): string {
  return `${kind}:${id}`;
}

export class FraudGraph {
  private readonly _adj: Adj;
  /** node key → kind (for reconstructing typed nodes) */
  private readonly _kinds: Map<string, GraphNodeKind>;

  constructor() {
    this._adj = new Map();
    this._kinds = new Map();
  }

  /** user used a shared attribute (device/card/ip/address). */
  addEdge(userId: string, kind: GraphNodeKind, attributeId: string): void {
    const u = key('user', userId);
    const a = key(kind, attributeId);
    this._link(u, a);
    this._kinds.set(u, 'user');
    this._kinds.set(a, kind);
  }

  /** Convenience: register a transaction's edges. */
  addActivity(
    userId: string,
    attrs: Partial<Record<Exclude<GraphNodeKind, 'user'>, string>>
  ): void {
    for (const [kind, id] of Object.entries(attrs)) {
      if (id !== undefined) {
        this.addEdge(userId, kind as GraphNodeKind, id);
      }
    }
  }

  /**
   * The fraud ring containing `userId`: its whole connected
   * component analyzed for members, shared attributes, depth.
   * Returns undefined for isolated users (no ring).
   */
  ringOf(userId: string): FraudRingResult | undefined {
    const seed = key('user', userId);
    if (!this._adj.has(seed)) return undefined;

    // BFS the whole component, tracking depth from seed.
    const depth = new Map<string, number>([[seed, 0]]);
    const queue = [seed];
    const component = new Set<string>([seed]);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const d = depth.get(cur)!;
      for (const next of this._adj.get(cur) ?? []) {
        if (!component.has(next)) {
          component.add(next);
          depth.set(next, d + 1);
          queue.push(next);
        }
      }
    }

    const userIds = [...component]
      .filter((n) => n.startsWith('user:'))
      .map((n) => n.slice(5))
      .sort();
    if (userIds.length < 2) return undefined; // not a ring

    // Attributes connected to ≥2 users of the component.
    const shared = [...component]
      .filter((n) => !n.startsWith('user:'))
      .filter((n) => {
        let users = 0;
        for (const m of this._adj.get(n) ?? []) {
          if (component.has(m) && m.startsWith('user:')) users++;
        }
        return users >= 2;
      })
      .map((n) => this._toNode(n));

    // Max user↔user shortest-path: BFS depths are from the seed only;
    // true diameter needs all-pairs — approximated by max depth of a
    // user node (depth counts user→attr→user hops, so /2).
    let maxDepth = 0;
    for (const [n, d] of depth) {
      if (n.startsWith('user:') && d > maxDepth) maxDepth = d;
    }

    const riskScore = Math.min(
      1,
      0.15 * userIds.length + 0.1 * shared.length + 0.05 * (maxDepth / 2)
    );
    return {
      userIds,
      componentSize: component.size,
      sharedAttributes: shared,
      riskScore,
      maxDepth: maxDepth / 2, // in user-hops
    };
  }

  /** Users reachable from `userId` within `depth` user-hops. */
  usersWithin(userId: string, depth: number): string[] {
    const seed = key('user', userId);
    const seen = new Set([seed]);
    const out: string[] = [];
    let frontier = [seed];
    let d = 0;
    while (frontier.length > 0 && d < depth * 2) {
      const next: string[] = [];
      for (const cur of frontier) {
        for (const m of this._adj.get(cur) ?? []) {
          if (seen.has(m)) continue;
          seen.add(m);
          next.push(m);
          if (m.startsWith('user:')) out.push(m.slice(5));
        }
      }
      frontier = next;
      d++;
    }
    return out.sort();
  }

  /** Users sharing a specific attribute value. */
  usersOn(kind: GraphNodeKind, attributeId: string): string[] {
    const k = key(kind, attributeId);
    const out: string[] = [];
    for (const n of this._adj.get(k) ?? []) {
      if (n.startsWith('user:')) out.push(n.slice(5));
    }
    return out.sort();
  }

  get nodeCount(): number {
    return this._adj.size;
  }

  get edgeCount(): number {
    let n = 0;
    for (const s of this._adj.values()) n += s.size;
    return n / 2;
  }

  /* ---------------------------------------------------------------- */

  private _link(a: string, b: string): void {
    let sa = this._adj.get(a);
    if (sa === undefined) {
      sa = new Set();
      this._adj.set(a, sa);
    }
    sa.add(b);
    let sb = this._adj.get(b);
    if (sb === undefined) {
      sb = new Set();
      this._adj.set(b, sb);
    }
    sb.add(a);
  }

  private _toNode(n: string): GraphNode {
    const i = n.indexOf(':');
    return { kind: this._kinds.get(n) ?? (n.slice(0, i) as GraphNodeKind), id: n.slice(i + 1) };
  }
}
