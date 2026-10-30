/**
 * ConsistentHashRing — ketama-style consistent hashing for cache
 * placement.
 *
 * When cache keys are sharded across N nodes, naive `hash(key) % N`
 * remaps ~all keys whenever N changes (a node join/leave is a cache
 * massacre). Consistent hashing places each node at M points on a
 * 2^32 ring and a key belongs to the first node clockwise:
 *
 *   ring:  ──nodeA──nodeB──nodeA──nodeC──nodeB── (wraps)
 *   key k → walk clockwise → first node point = owner
 *
 * Properties:
 *   - Adding/removing a node remaps only ~1/N of keys (the arcs the
 *     new/removed points own) — bounded monotonic ownership transfer.
 *   - `replicas` virtual points per node smooth the distribution; the
 *     default 160 is the standard ketama value (each point is a
 *     distinct hash of `node#i`).
 *   - Lookups are O(log P) via binary search over sorted points.
 *   - `owners(key, n)` walks the ring past distinct nodes — for
 *     read-replica fallbacks or N-redundant writes.
 *
 * Hash: FNV-1a for both node points and keys — deterministic, cheap,
 * good enough spread (production deployments typically use md5/ketama
 * or xxhash; FNV keeps this dependency-free).
 *
 * Complexity: add/remove O(R log P); lookup O(log P); O(P) memory for
 * P = nodes×replicas points.
 *
 * @module CacheLayer/Engine
 */

import { fnv1a32 } from './types';

export interface RingNode {
  id: string;
  /** Relative weight — scales its virtual point count. Default 1. */
  weight?: number;
}

interface RingPoint {
  hash: number;
  nodeId: string;
}

export class ConsistentHashRing {
  private readonly _replicas: number;
  private readonly _points: RingPoint[] = [];
  private readonly _nodes = new Map<string, number>(); // id → weight

  constructor(replicas = 160) {
    this._replicas = Math.max(1, replicas);
  }

  /** Add `node`; `weight` scales virtual points (heavier = more arcs). */
  add(node: RingNode): void {
    const weight = Math.max(1, Math.round(node.weight ?? 1));
    if (this._nodes.has(node.id)) return;
    this._nodes.set(node.id, weight);
    const count = this._replicas * weight;
    for (let i = 0; i < count; i++) {
      this._points.push({ hash: fnv1a32(`${node.id}#${i}`), nodeId: node.id });
    }
    this._points.sort((a, b) => a.hash - b.hash);
  }

  /** Remove a node and all its points. */
  remove(nodeId: string): boolean {
    if (!this._nodes.delete(nodeId)) return false;
    // O(P) filter — removals are rare vs lookups.
    for (let i = this._points.length - 1; i >= 0; i--) {
      if (this._points[i].nodeId === nodeId) this._points.splice(i, 1);
    }
    return true;
  }

  /** The node owning `key`, or `null` on an empty ring. */
  owner(key: string): string | null {
    const n = this.owners(key, 1);
    return n.length > 0 ? n[0] : null;
  }

  /**
   * First `count` distinct nodes owning `key` walking clockwise —
   * for replica placement or fallback chains.
   */
  owners(key: string, count: number): string[] {
    if (this._points.length === 0 || count <= 0) return [];
    const h = fnv1a32(key);
    let i = this._lowerBound(h);
    const out: string[] = [];
    const seen = new Set<string>();
    // Walk at most all points; wrap to index 0 past the end.
    for (let walked = 0; walked < this._points.length && out.length < count; walked++) {
      const p = this._points[i];
      if (!seen.has(p.nodeId)) {
        seen.add(p.nodeId);
        out.push(p.nodeId);
      }
      i = (i + 1) % this._points.length;
    }
    return out;
  }

  /**
   * Keys-per-node histogram for `sampleKeys` — a load-balance sanity
   * check (uniform ring → near-equal counts).
   */
  distribution(sampleKeys: readonly string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const k of sampleKeys) {
      const o = this.owner(k);
      if (o !== null) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    return counts;
  }

  /** Fraction of ring arc owned by `nodeId` (0..1). */
  ownership(nodeId: string): number {
    if (this._points.length === 0) return 0;
    // Fraction of the hash space this node's points "cover" = fraction
    // of points it owns (each point owns the arc back to its predecessor).
    let mine = 0;
    for (const p of this._points) if (p.nodeId === nodeId) mine++;
    return mine / this._points.length;
  }

  nodeIds(): string[] {
    return Array.from(this._nodes.keys());
  }

  get size(): number {
    return this._nodes.size;
  }

  /** First index in the sorted points with hash ≥ h (wraps to 0). */
  private _lowerBound(h: number): number {
    let lo = 0;
    let hi = this._points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._points[mid].hash < h) lo = mid + 1;
      else hi = mid;
    }
    return lo === this._points.length ? 0 : lo;
  }
}
