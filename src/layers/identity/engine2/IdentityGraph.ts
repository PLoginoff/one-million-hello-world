/**
 * IdentityGraph — typed relationship graph over identities, devices,
 * sessions and credentials.
 *
 * An identity platform's risk and support questions are graph
 * questions: "which users share this device?", "what sessions sprang
 * from this login?", "is this account linked to a known-fraudulent
 * identity?". The graph answers them over an in-memory adjacency
 * index.
 *
 * Model:
 *   nodes: typed entities — user | device | session | credential | ip
 *   edges: typed relations — owns_device | has_session | authenticated_by
 *          | used_ip | merged_into
 *
 * Edges are directed but indexed BOTH ways so neighbor queries are
 * O(degree) in either direction. Node attributes live on the node so
 * queries can filter by property without a second lookup.
 *
 * Traversal: breadth-first with depth cap and edge-type filtering —
 * enough for "find all users within 2 hops of device D" without a
 * query language.
 *
 * @module Identity/Engine2
 */

// ------------------------------------------------------------------ model

export type IdentityNodeType = 'user' | 'device' | 'session' | 'credential' | 'ip';

export type IdentityEdgeType =
  | 'owns_device'
  | 'has_session'
  | 'authenticated_by'
  | 'used_ip'
  | 'merged_into';

export interface IdentityNode {
  readonly id: string;
  readonly type: IdentityNodeType;
  readonly createdAt: number;
  /** Free-form properties (fingerprint, ua, risk tags, ...). */
  readonly attrs: Record<string, unknown>;
}

export interface IdentityEdge {
  readonly from: string;
  readonly to: string;
  readonly type: IdentityEdgeType;
  readonly createdAt: number;
}

/** A node reached by traversal, with its path distance. */
export interface GraphHit {
  readonly node: IdentityNode;
  readonly depth: number;
  /** Edge types followed to reach the node (path summary). */
  readonly via: IdentityEdgeType[];
}

// ------------------------------------------------------------------ graph

export class IdentityGraph {
  private readonly _nodes = new Map<string, IdentityNode>();
  private readonly _out = new Map<string, Set<IdentityEdge>>();
  private readonly _in = new Map<string, Set<IdentityEdge>>();
  private readonly _now: () => number;

  constructor(now: () => number = Date.now) {
    this._now = now;
  }

  /** Upsert a node. Existing attrs are merged (not replaced). */
  addNode(id: string, type: IdentityNodeType, attrs: Record<string, unknown> = {}): IdentityNode {
    const existing = this._nodes.get(id);
    if (existing) {
      const merged: IdentityNode = { ...existing, attrs: { ...existing.attrs, ...attrs } };
      this._nodes.set(id, merged);
      return merged;
    }
    const node: IdentityNode = { id, type, createdAt: this._now(), attrs };
    this._nodes.set(id, node);
    return node;
  }

  /** Add a directed edge (auto-creates endpoint stubs if unknown). */
  link(from: string, to: string, type: IdentityEdgeType): IdentityEdge {
    if (!this._nodes.has(from)) throw new Error(`Unknown node '${from}'`);
    if (!this._nodes.has(to)) throw new Error(`Unknown node '${to}'`);
    const edge: IdentityEdge = { from, to, type, createdAt: this._now() };
    let out = this._out.get(from);
    if (!out) {
      out = new Set();
      this._out.set(from, out);
    }
    out.add(edge);
    let inn = this._in.get(to);
    if (!inn) {
      inn = new Set();
      this._in.set(to, inn);
    }
    inn.add(edge);
    return edge;
  }

  /** Remove an edge. */
  unlink(from: string, to: string, type: IdentityEdgeType): boolean {
    const out = this._out.get(from);
    if (!out) return false;
    let removed: IdentityEdge | undefined;
    for (const e of out) {
      if (e.to === to && e.type === type) {
        removed = e;
        out.delete(e);
        break;
      }
    }
    if (!removed) return false;
    const inn = this._in.get(to);
    if (inn) {
      for (const e of inn) {
        if (e.from === from && e.type === type) inn.delete(e);
      }
    }
    return true;
  }

  node(id: string): IdentityNode | undefined {
    return this._nodes.get(id);
  }

  /** Convenience: register a session on a device from an ip for a user. */
  recordLogin(userId: string, sessionId: string, deviceId?: string, ip?: string): void {
    this.addNode(sessionId, 'session');
    this.link(userId, sessionId, 'has_session');
    if (deviceId !== undefined) {
      this.addNode(deviceId, 'device');
      this.link(userId, deviceId, 'owns_device');
      this.link(sessionId, deviceId, 'authenticated_by');
    }
    if (ip !== undefined) {
      this.addNode(ip, 'ip');
      this.link(sessionId, ip, 'used_ip');
    }
  }

  /**
   * Breadth-first traversal from `startId`.
   *
   * @param edgeTypes  edge filter — undefined follows all types
   * @param direction  'out' (from→to), 'in' (to→from) or 'both'
   * @param maxDepth   hop cap (default 3 — keeps expansion bounded)
   */
  traverse(
    startId: string,
    options: { edgeTypes?: IdentityEdgeType[]; direction?: 'out' | 'in' | 'both'; maxDepth?: number; nodeTypes?: IdentityNodeType[] } = {},
  ): GraphHit[] {
    const { edgeTypes, direction = 'both', maxDepth = 3, nodeTypes } = options;
    const hits = new Map<string, GraphHit>();
    const queue: Array<{ id: string; depth: number; via: IdentityEdgeType[] }> = [{ id: startId, depth: 0, via: [] }];
    const seen = new Set([startId]);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const follow = (edges: Set<IdentityEdge> | undefined, next: (e: IdentityEdge) => string): void => {
        if (!edges) return;
        for (const e of edges) {
          if (edgeTypes && !edgeTypes.includes(e.type)) continue;
          const nid = next(e);
          if (seen.has(nid)) continue;
          seen.add(nid);
          const node = this._nodes.get(nid);
          if (!node) continue;
          const via = [...cur.via, e.type];
          if (!nodeTypes || nodeTypes.includes(node.type)) {
            hits.set(nid, { node, depth: cur.depth + 1, via });
          }
          if (cur.depth + 1 < maxDepth) {
            queue.push({ id: nid, depth: cur.depth + 1, via });
          }
        }
      };
      if (direction === 'out' || direction === 'both') follow(this._out.get(cur.id), (e) => e.to);
      if (direction === 'in' || direction === 'both') follow(this._in.get(cur.id), (e) => e.from);
    }
    return [...hits.values()];
  }

  /**
   * Users reachable from a shared artifact (device or ip) — the classic
   * "who else uses this device" query. Two hops: artifact <-session- user.
   */
  linkedUsers(artifactId: string): IdentityNode[] {
    return this.traverse(artifactId, { direction: 'in', maxDepth: 2, nodeTypes: ['user'] }).map((h) => h.node);
  }

  /**
   * Connected component of a user — every node reachable within
   * `maxDepth` hops in either direction. Used for full-account export
   * (GDPR data-portability) and fraud ring inspection.
   */
  componentOf(userId: string, maxDepth = 4): GraphHit[] {
    return this.traverse(userId, { direction: 'both', maxDepth });
  }

  /** Node count by type — stats. */
  stats(): Record<string, number> {
    const out: Record<string, number> = { nodes: this._nodes.size, edges: 0 };
    for (const edges of this._out.values()) out.edges! += edges.size;
    for (const n of this._nodes.values()) {
      out[`type:${n.type}`] = (out[`type:${n.type}`] ?? 0) + 1;
    }
    return out;
  }
}
