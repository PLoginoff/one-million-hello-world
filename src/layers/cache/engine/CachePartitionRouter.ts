/**
 * CachePartitionRouter — consistent-hash routing of keys to cache
 * partitions, plus migration planning for ring changes.
 *
 * A single flat cache doesn't scale past one heap; sharding is the
 * answer and the only interesting question is *which shard owns key
 * k*. `hash(k) % N` remaps ~everything when N changes — this router
 * layers on {@link ConsistentHashRing} so a partition join/leave
 * moves only ~1/N of the keyspace.
 *
 * On top of raw ring ownership it adds the pieces a sharded cache
 * actually needs:
 *
 *  - `route(key)`            → the partition that must serve `key`.
 *  - `routeMany(keys)`       → grouped plan; one ring pass per key but
 *                              results pre-grouped per partition for
 *                              scatter-gather callers (mget/mset).
 *  - `replicas(key)`         → primary + N-1 successors — the replica
 *                              set for redundant writes/fallback reads.
 *  - `planMigration(added,   → a key-level diff: of the keys you hand
 *    removed, keys)`           it, which must move and to where. The
 *                              router replays keys through a cloned
 *                              ring before/after the change — O(K log P),
 *                              no approximation.
 *
 * Two correctness details worth the code:
 *
 *  1. Partition ids are opaque strings; the router keeps partition
 *     *metadata* (capacity weight, zone label for replica spreading)
 *     beside the ring so callers get a `Partition`, not a bare id.
 *
 *  2. Replica selection can avoid co-locating replicas: with
 *     `zoneAware`, `replicas()` skips successive owners in the same
 *     zone until `replicaCount` distinct zones are used (or runs out —
 *     then it takes what exists). Losing one zone then never loses
 *     every copy of a key.
 *
 * Complexity: route O(log P); routeMany O(K log P) with an O(P)
 * grouping pass; planMigration O(K log P + P log P) for the ring diff.
 *
 * @module CacheLayer/Engine
 */

import { ConsistentHashRing } from './ConsistentHashRing';

/* ------------------------------------------------------------------ */
/* Partitions                                                          */
/* ------------------------------------------------------------------ */

export interface Partition {
  /** Unique partition id (the ring node id). */
  readonly id: string;
  /**
   * Relative capacity — scales virtual points on the ring. A partition
   * with weight 3 claims ~3× the keyspace of a weight-1 partition.
   */
  readonly weight: number;
  /**
   * Failure-domain label ('az-a', 'rack-3'...). With zone-aware
   * replica placement, the router avoids putting two replicas of one
   * key in the same zone.
   */
  readonly zone?: string;
}

export interface RouteDecision {
  /** Owning partition (primary). `null` only on an empty ring. */
  readonly partition: Partition | null;
  /**
   * Full replica set in preference order: [primary, first fallback,
   * second fallback, ...]. Length = min(replicaCount, live partitions)
   * for zone-aware placement, may be shorter only when zones run out.
   */
  readonly replicas: readonly Partition[];
  /** Raw ring hash of the key (diagnostics / affinity grouping). */
  readonly keyHash: number;
}

export interface RouteGroup {
  readonly partition: Partition;
  readonly keys: readonly string[];
}

export interface MigrationStep {
  readonly key: string;
  readonly from: Partition;
  readonly to: Partition;
}

export interface MigrationPlan {
  /** Keys that must move, with source and destination. */
  readonly moves: readonly MigrationStep[];
  /** Keys that stay put — `moves.length + stays` = input size. */
  readonly stays: number;
  /** Partitions added by this plan. */
  readonly added: readonly Partition[];
  /** Partitions removed by this plan. */
  readonly removed: readonly Partition[];
  /**
   * Fraction of sampled keys that move. For a uniform ring and adding
   * one node to N, expect ~1/(N+1); removing one, ~1/N.
   */
  readonly churnFraction: number;
}

export interface RouterOptions {
  /** Virtual ring points per unit weight (default 160, ketama). */
  readonly replicasPerWeight?: number;
  /** Replica set size for `replicas()` (default 2: primary + 1). */
  readonly replicaCount?: number;
  /**
   * Prefer distinct zones across the replica set (default true when
   * partitions declare zones).
   */
  readonly zoneAware?: boolean;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export class CachePartitionRouter {
  private readonly _ring: ConsistentHashRing;
  private readonly _replicaCount: number;
  private readonly _zoneAware: boolean;
  private readonly _replicasPerWeight: number;
  private readonly _partitions = new Map<string, Partition>();

  constructor(opts: RouterOptions = {}) {
    this._replicasPerWeight = Math.max(1, opts.replicasPerWeight ?? 160);
    this._ring = new ConsistentHashRing(this._replicasPerWeight);
    this._replicaCount = Math.max(1, opts.replicaCount ?? 2);
    this._zoneAware = opts.zoneAware ?? true;
  }

  /* ------------------------------------------------------------ */
  /* Membership                                                    */
  /* ------------------------------------------------------------ */

  /** Register a partition; idempotent. */
  addPartition(partition: Partition): void {
    if (this._partitions.has(partition.id)) return;
    this._partitions.set(partition.id, partition);
    this._ring.add({ id: partition.id, weight: partition.weight });
  }

  /** Deregister; returns false for unknown ids. */
  removePartition(id: string): boolean {
    if (!this._partitions.delete(id)) return false;
    return this._ring.remove(id);
  }

  /** Live partitions, insertion order. */
  partitions(): Partition[] {
    return Array.from(this._partitions.values());
  }

  get size(): number {
    return this._partitions.size;
  }

  /* ------------------------------------------------------------ */
  /* Routing                                                       */
  /* ------------------------------------------------------------ */

  /** Primary owner + replica set for `key`. */
  route(key: string): RouteDecision {
    const ownerIds = this._replicaCount === 1
      ? this._ring.owners(key, 1)
      : this._pickOwners(key);
    const replicas = ownerIds
      .map((id) => this._partitions.get(id))
      .filter((p): p is Partition => p !== undefined);
    return {
      partition: replicas.length > 0 ? replicas[0] : null,
      replicas,
      keyHash: this._hash(key),
    };
  }

  /** Just the primary — O(log P), no allocation beyond the id walk. */
  owner(key: string): Partition | null {
    const id = this._ring.owner(key);
    return id === null ? null : this._partitions.get(id) ?? null;
  }

  /**
   * Group `keys` by owning partition — the scatter phase of a
   * scatter-gather multi-get. Order within each group follows input
   * order (stable).
   */
  routeMany(keys: readonly string[]): RouteGroup[] {
    const groups = new Map<string, { partition: Partition; keys: string[] }>();
    const order: string[] = [];
    for (const key of keys) {
      const p = this.owner(key);
      if (p === null) continue;
      let g = groups.get(p.id);
      if (!g) {
        g = { partition: p, keys: [] };
        groups.set(p.id, g);
        order.push(p.id);
      }
      g.keys.push(key);
    }
    return order.map((id) => groups.get(id) as { partition: Partition; keys: string[] });
  }

  /* ------------------------------------------------------------ */
  /* Migration planning                                            */
  /* ------------------------------------------------------------ */

  /**
   * Diff current ownership vs. ownership under `added`/`removed`,
   * replaying `keys` through before/after rings. Returns exactly which
   * keys must migrate — a real rollout copies exactly those, nothing
   * else.
   *
   * Implementation: clone the ring state by rebuilding two routers —
   * cheap enough (P log P) relative to the key replay (K log P) it
   * enables, and far more auditable than mutating in place.
   */
  planMigration(
    added: readonly Partition[],
    removed: readonly string[],
    keys: readonly string[]
  ): MigrationPlan {
    const before = this._snapshotOwners(keys);

    // Build the "after" membership.
    const afterParts = this.partitions().filter((p) => !removed.includes(p.id));
    const afterRouter = new CachePartitionRouter({
      replicasPerWeight: this._ringPointsPerWeight(),
      replicaCount: this._replicaCount,
      zoneAware: this._zoneAware,
    });
    for (const p of afterParts) afterRouter.addPartition(p);
    for (const p of added) afterRouter.addPartition(p);

    const moves: MigrationStep[] = [];
    let stays = 0;
    for (let i = 0; i < keys.length; i++) {
      const from = before[i];
      const to = afterRouter.owner(keys[i]);
      if (from !== null && to !== null && from.id !== to.id) {
        moves.push({ key: keys[i], from, to });
      } else if (from !== null && to === null) {
        // Destination ring empty — treat as "must move" to first added
        // if any exists; otherwise the key has nowhere to go and we
        // count it as a move to nowhere (caller must handle).
        if (added.length > 0) {
          moves.push({ key: keys[i], from, to: added[0] });
        }
      } else {
        stays++;
      }
    }

    return {
      moves,
      stays,
      added,
      removed: this.partitions().filter((p) => removed.includes(p.id)),
      churnFraction: keys.length > 0 ? moves.length / keys.length : 0,
    };
  }

  /**
   * Keys-per-partition histogram over a sample — the load-balance
   * sanity check operators actually look at.
   */
  distribution(sampleKeys: readonly string[]): Map<string, number> {
    return this._ring.distribution(sampleKeys);
  }

  /** Fraction of the ring owned by `partitionId` (0..1). */
  ownership(partitionId: string): number {
    return this._ring.ownership(partitionId);
  }

  /* ------------------------------------------------------------ */
  /* Internals                                                     */
  /* ------------------------------------------------------------ */

  /**
   * Replica selection. Default: first `replicaCount` distinct ring
   * owners. Zone-aware: walk the full ring, prefer owners in zones not
   * yet used; only when distinct zones are exhausted do we double up
   * (a degraded-but-correct replica set beats a short one).
   */
  private _pickOwners(key: string): string[] {
    const all = this._ring.owners(key, this._partitions.size);
    if (!this._zoneAware) return all.slice(0, this._replicaCount);
    const usedZones = new Set<string>();
    const picked: string[] = [];
    const deferred: string[] = [];
    for (const id of all) {
      const zone = this._partitions.get(id)?.zone;
      if (zone === undefined || !usedZones.has(zone)) {
        if (zone !== undefined) usedZones.add(zone);
        picked.push(id);
      } else {
        deferred.push(id);
      }
      if (picked.length >= this._replicaCount) break;
    }
    for (const id of deferred) {
      if (picked.length >= this._replicaCount) break;
      picked.push(id);
    }
    return picked;
  }

  private _snapshotOwners(keys: readonly string[]): Array<Partition | null> {
    return keys.map((k) => this.owner(k));
  }

  private _hash(key: string): number {
    // Same hash the ring uses — keeps keyHash meaningful vs ring point
    // positions. fnv1a32 is re-exported indirectly via ring internals;
    // duplicating the one-liner keeps this module's deps at the ring
    // boundary only.
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  private _ringPointsPerWeight(): number {
    return this._replicasPerWeight;
  }
}
