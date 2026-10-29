/**
 * ConsistentHashingStrategy
 *
 * Implements consistent hashing on a ring with **virtual nodes** (Karger et
 * al., "Consistent Hashing and Random Trees", 1997 — the algorithm behind
 * Amazon Dynamo's partitioning and most memcached clients).
 *
 * Ring construction:
 *   - Each physical backend contributes `virtualNodes` points on a 32-bit
 *     ring; point i for backend b is `hash("${b.id}#${i}")`.
 *   - Points are kept in a sorted array; lookup is binary search
 *     (first point >= hash(key)), O(log V) where V = total vnodes.
 *   - When a key lands past the last point we wrap to index 0.
 *
 * Rebalancing property:
 *   Adding/removing a backend remaps only ~1/N of the key space (the vnodes
 *   it owns), unlike `hash(key) % N` which remaps nearly everything.
 *
 * The strategy keeps a per-backend *view* of the ring and lazily rebuilds it
 * when membership changes (rebuild is O(V log V)).
 *
 * @module LoadBalancerLayer/Strategies
 */

import {
  BackendPoolEntry,
  BackendSelection,
  BalanceRequest,
  IBalancingStrategy,
  isEligible,
} from '../types/backend';

/** Default vnode count per backend; enough for ~±5% key-distribution balance. */
export const DEFAULT_VIRTUAL_NODES = 160;

interface RingPoint {
  hash: number;
  backendId: string;
}

/**
 * FNV-1a 32-bit hash — fast, well-distributed, deterministic across
 * platforms (unlike MD5/SHA which pull in crypto deps).
 */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h = h * 16777619 (FNV prime), kept in 32 bits.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export class ConsistentHashingStrategy implements IBalancingStrategy {
  readonly name = 'consistent-hashing';

  private readonly _virtualNodes: number;
  private readonly _points: RingPoint[];
  private readonly _members: Map<string, BackendPoolEntry>;
  private _dirty: boolean;
  private _selectionCount: number;

  constructor(virtualNodes: number = DEFAULT_VIRTUAL_NODES) {
    this._virtualNodes = Math.max(1, Math.floor(virtualNodes));
    this._points = [];
    this._members = new Map();
    this._dirty = false;
    this._selectionCount = 0;
  }

  /**
   * Route by consistent-hash of `affinityKey ?? clientIp ?? ""`.
   *
   * Falls back to linear walk of eligible entries when the ring is empty
   * (e.g., onBackendAdded was never invoked because the strategy was used
   * standalone).
   */
  select(backends: readonly BackendPoolEntry[], request: BalanceRequest): BackendSelection | undefined {
    if (backends.length === 0) {
      return undefined;
    }

    // Lazy ring sync if the caller bypassed registerStrategy.
    for (const e of backends) {
      if (!this._members.has(e.backend.id)) {
        this._members.set(e.backend.id, e);
        this._dirty = true;
      }
    }
    for (const id of Array.from(this._members.keys())) {
      if (!backends.find((b) => b.backend.id === id)) {
        this._members.delete(id);
        this._dirty = true;
      }
    }
    if (this._dirty) {
      this._rebuild();
    }

    const key = request.affinityKey ?? request.clientIp ?? '';
    if (key === '' || this._points.length === 0) {
      // No affinity — degrade gracefully to first eligible.
      const first = backends.find(isEligible);
      if (!first) {
        return undefined;
      }
      return {
        backend: first.backend,
        strategy: this.name,
        selectedAt: Date.now(),
        diagnostics: { reason: 'no-affinity-key', fallback: true },
      };
    }

    const point = fnv1a32(key);
    let idx = this._lowerBound(point);
    if (idx === this._points.length) {
      idx = 0;
    }

    // Walk the ring from the landing point until we hit an eligible backend.
    // Normally that's the first one we hit; when the owner is unhealthy we
    // keep walking — the standard "next vnode wins" failover.
    const seen = new Set<string>();
    for (let hops = 0; hops < this._points.length; hops++) {
      const p = this._points[(idx + hops) % this._points.length];
      if (seen.has(p.backendId)) {
        continue;
      }
      seen.add(p.backendId);
      const entry = this._members.get(p.backendId);
      if (entry && isEligible(entry)) {
        this._selectionCount += 1;
        return {
          backend: entry.backend,
          strategy: this.name,
          selectedAt: Date.now(),
          diagnostics: {
            key,
            hash: point,
            hops,
            vnodeHash: p.hash,
            selectionNumber: this._selectionCount,
          },
        };
      }
      if (seen.size >= backends.length) {
        break;
      }
    }

    return undefined;
  }

  onBackendAdded(entry: BackendPoolEntry): void {
    if (!this._members.has(entry.backend.id)) {
      this._members.set(entry.backend.id, entry);
      this._dirty = true;
    }
  }

  onBackendRemoved(entry: BackendPoolEntry): void {
    if (this._members.delete(entry.backend.id)) {
      this._dirty = true;
    }
  }

  /** Number of points currently on the ring (after last rebuild). */
  get ringSize(): number {
    return this._points.length;
  }

  /** Member count tracked by the ring. */
  get memberCount(): number {
    return this._members.size;
  }

  /** Force rebuild (exposed for tests). */
  rebuild(): void {
    this._rebuild();
  }

  /**
   * Distribution histogram: how many ring points each backend owns.
   * Useful for tests asserting rough balance.
   */
  distribution(): Map<string, number> {
    const out = new Map<string, number>();
    for (const p of this._points) {
      out.set(p.backendId, (out.get(p.backendId) ?? 0) + 1);
    }
    return out;
  }

  /**
   * Binary search for the first ring point >= hash. O(log V).
   */
  private _lowerBound(hash: number): number {
    let lo = 0;
    let hi = this._points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._points[mid].hash < hash) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Rebuild the sorted point list from the member set. O(V log V).
   */
  private _rebuild(): void {
    this._points.length = 0;
    for (const id of this._members.keys()) {
      for (let i = 0; i < this._virtualNodes; i++) {
        this._points.push({ hash: fnv1a32(`${id}#${i}`), backendId: id });
      }
    }
    this._points.sort((a, b) => a.hash - b.hash);
    this._dirty = false;
  }
}
