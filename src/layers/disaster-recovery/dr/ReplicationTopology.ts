/**
 * Disaster Recovery — Replication Topology
 *
 * Models a replication graph (primary → replica edges) and answers the
 * questions failover planning needs:
 *
 * - `promotionCandidates()` — replicas of a node, ranked by applied position
 *   then health (the least-stale healthy replica promotes).
 * - `wouldOrphan(nodeId)` — descendants that lose their upstream if the node
 *   dies; chain topologies (A→B→C) must reparent C before killing B.
 * - `reparent(orphan, newParent)` — rewire a replica to a surviving upstream.
 * - `partition(nodeIds)` — mark a set unreachable (simulates region loss) and
 *   returns the surviving voter set for quorum math.
 *
 * The graph is a simple adjacency map; operations are O(V+E).
 *
 * @module DisasterRecovery/DR
 */

import { DrClock, DrNode } from './DrTypes';

export interface ReplicationEdge {
  readonly fromId: string;
  readonly toId: string;
  /** Whether replication is currently streaming on this edge. */
  streaming: boolean;
}

export class ReplicationTopology {
  private readonly _clock: DrClock;
  private readonly _nodes = new Map<string, DrNode>();
  private readonly _edges: ReplicationEdge[] = [];

  constructor(clock: DrClock = Date.now) {
    this._clock = clock;
  }

  addNode(node: DrNode): void {
    this._nodes.set(node.nodeId, node);
  }

  removeNode(nodeId: string): boolean {
    if (!this._nodes.delete(nodeId)) return false;
    for (let i = this._edges.length - 1; i >= 0; i--) {
      if (this._edges[i].fromId === nodeId || this._edges[i].toId === nodeId) {
        this._edges.splice(i, 1);
      }
    }
    return true;
  }

  /** Declare replication from → to (e.g. primary → replica, or replica → cascaded replica). */
  link(fromId: string, toId: string): void {
    if (!this._nodes.has(fromId) || !this._nodes.has(toId)) {
      throw new Error(`link requires both nodes registered (${fromId} → ${toId})`);
    }
    if (fromId === toId) throw new Error('self-link not allowed');
    if (this._edges.some((e) => e.fromId === fromId && e.toId === toId)) return;
    this._edges.push({ fromId, toId, streaming: true });
  }

  unlink(fromId: string, toId: string): boolean {
    const i = this._edges.findIndex((e) => e.fromId === fromId && e.toId === toId);
    if (i < 0) return false;
    this._edges.splice(i, 1);
    return true;
  }

  node(nodeId: string): DrNode | undefined {
    return this._nodes.get(nodeId);
  }

  get nodes(): ReadonlyArray<DrNode> {
    return [...this._nodes.values()];
  }

  /** Direct replicas (downstream) of a node. */
  replicasOf(nodeId: string): DrNode[] {
    return this._edges
      .filter((e) => e.fromId === nodeId)
      .map((e) => this._nodes.get(e.toId))
      .filter((n): n is DrNode => n !== undefined);
  }

  /** Direct upstreams of a node. */
  upstreamsOf(nodeId: string): DrNode[] {
    return this._edges
      .filter((e) => e.toId === nodeId)
      .map((e) => this._nodes.get(e.fromId))
      .filter((n): n is DrNode => n !== undefined);
  }

  /**
   * Promotion candidates for a (presumably failed) node: its direct replicas,
   * ranked by appliedPosition desc then healthy-first. The winner is the
   * least-stale healthy replica.
   */
  promotionCandidates(nodeId: string): DrNode[] {
    return this.replicasOf(nodeId)
      .slice()
      .sort((a, b) => {
        if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
        if (a.appliedPosition !== b.appliedPosition) {
          return a.appliedPosition > b.appliedPosition ? -1 : 1;
        }
        return a.nodeId.localeCompare(b.nodeId); // deterministic tiebreak
      });
  }

  /**
   * Nodes that would lose ALL upstream connectivity if `nodeId` vanished —
   * the "orphans" of a chain or the leaves of a tree.
   */
  wouldOrphan(nodeId: string): string[] {
    const orphans: string[] = [];
    for (const n of this._nodes.values()) {
      if (n.nodeId === nodeId) continue;
      const ups = this.upstreamsOf(n.nodeId).filter((u) => u.nodeId !== nodeId);
      const had = this._edges.some((e) => e.toId === n.nodeId && e.fromId === nodeId);
      if (had && ups.length === 0) orphans.push(n.nodeId);
    }
    return orphans;
  }

  /** Rewire `orphanId` from its (dead) upstream to `newParentId`. */
  reparent(orphanId: string, newParentId: string): void {
    const ups = this.upstreamsOf(orphanId).map((u) => u.nodeId);
    for (const u of ups) this.unlink(u, orphanId);
    this.link(newParentId, orphanId);
  }

  /**
   * Simulate a region/partition loss: mark nodes unhealthy and stop their
   * edge streaming. Returns the surviving voter set for quorum computation.
   */
  partition(nodeIds: ReadonlyArray<string>): { survivors: DrNode[]; partitioned: DrNode[] } {
    const dead = new Set(nodeIds);
    const survivors: DrNode[] = [];
    const partitioned: DrNode[] = [];
    for (const n of this._nodes.values()) {
      if (dead.has(n.nodeId)) {
        n.healthy = false;
        partitioned.push(n);
      } else {
        survivors.push(n);
      }
    }
    for (const e of this._edges) {
      if (dead.has(e.fromId) || dead.has(e.toId)) e.streaming = false;
    }
    void this._clock;
    return { survivors, partitioned };
  }

  /** Restore partitioned nodes healthy and re-enable their edges. */
  heal(nodeIds: ReadonlyArray<string>): void {
    const back = new Set(nodeIds);
    for (const n of this._nodes.values()) {
      if (back.has(n.nodeId)) n.healthy = true;
    }
    for (const e of this._edges) {
      if (this._nodes.get(e.fromId)?.healthy && this._nodes.get(e.toId)?.healthy) {
        e.streaming = true;
      }
    }
  }
}
