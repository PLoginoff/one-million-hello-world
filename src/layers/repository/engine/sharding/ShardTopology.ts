/**
 * ShardTopology — shard-map versioning + multi-cluster read routing.
 *
 * The router answers "which shard owns this key right now?" A real cluster
 * also needs to answer operational questions the ring alone can't:
 *
 *   - Topology versioning: every add/remove bumps a `generation`. Clients
 *     cache the map; a stale generation triggers a re-fetch — the gossip-
 *     style epoch that keeps a fleet of app servers consistent without a
 *     coordinator.
 *   - Cluster routing: when shards span failure domains (zones/regions),
 *     a read should prefer a shard in the CALLER's domain (locality) before
 *     falling back cross-zone — the "prefer-replica-in-same-AZ" routing
 *     real databases expose.
 *   - Weighted shards: not all shards are equal — a new shard should take
 *     a bigger share of new writes until it catches up (`writeWeight`),
 *     while reads stay uniform.
 *
 * This is a thin operational layer over `ShardRouter` — it wraps the ring
 * with a versioned, domain-aware view rather than replacing it.
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { ShardRouter } from './ShardRouter';
import { Shard, ShardKeyFn, ShardStore } from './types';

/** A shard's topology metadata. */
export interface ShardDescriptor {
  readonly name: string;
  /** Failure domain this shard lives in (zone/region/rack). */
  readonly zone: string;
  /**
   * Write preference weight — a new/underfilled shard gets >1 to attract
   * proportional writes; 1 = normal.
   */
  writeWeight: number;
  /** Serving health; unhealthy shards are skipped by read routing. */
  healthy: boolean;
  /** When this shard joined the ring (ms epoch) — for warmup heuristics. */
  readonly joinedAt: number;
}

export interface TopologyOptions {
  readonly clock?: () => number;
}

export class ShardTopology<T> {
  private readonly router: ShardRouter<T>;
  private readonly descriptors = new Map<string, ShardDescriptor>();
  private readonly clock: () => number;
  private generation = 0;

  constructor(
    router: ShardRouter<T>,
    descriptors: readonly ShardDescriptor[] = [],
    options: TopologyOptions = {}
  ) {
    this.router = router;
    this.clock = options.clock ?? Date.now;
    for (const d of descriptors) this.descriptors.set(d.name, { ...d });
    // Descriptors must cover registered shards — fill gaps at default.
    for (const name of router.shardNames()) {
      if (!this.descriptors.has(name)) {
        this.descriptors.set(name, {
          name,
          zone: 'default',
          writeWeight: 1,
          healthy: true,
          joinedAt: this.clock(),
        });
      }
    }
  }

  get currentGeneration(): number {
    return this.generation;
  }

  /** Registers a shard + descriptor (bumps the generation). */
  addShard(desc: ShardDescriptor, store: ShardStore<T>): void {
    this.router.addShard(desc.name, store);
    this.descriptors.set(desc.name, { ...desc });
    this.generation++;
  }

  removeShard(name: string): void {
    this.router.removeShard(name);
    this.descriptors.delete(name);
    this.generation++;
  }

  /** The descriptor map — what a client caches and compares generations on. */
  snapshot(): { generation: number; shards: readonly ShardDescriptor[] } {
    return {
      generation: this.generation,
      shards: [...this.descriptors.values()].map((d) => ({ ...d })),
    };
  }

  /**
   * Zone-aware read routing: among shards, prefer one in `localZone`.
   * For a point read the ring already fixes the owner — the zone question
   * is answered per shard by `ReplicaSet`s. So this method answers the
   * FAN-OUT case: which shards should a scatter query prefer, ordered
   * local-first, so a query that can early-exit hits locality.
   */
  readOrder(localZone: string): string[] {
    const shards = [...this.descriptors.values()].filter((d) => d.healthy);
    const local = shards.filter((d) => d.zone === localZone).map((d) => d.name);
    const remote = shards.filter((d) => d.zone !== localZone).map((d) => d.name);
    return [...local, ...remote];
  }

  /**
   * Weighted write routing: picks a shard for a NEW entity whose shard key
   * isn't fixed (e.g. round-robin tenant assignment). Weights bias the
   * pick — a `writeWeight: 3` shard gets ~3× the assignments, which is how
   * you fill a new shard quickly after scaling out.
   *
   * Weighted random selection via cumulative distribution: O(log n) pick
   * over prefix sums, same as a roulette-wheel.
   */
  pickWriteShard(random: () => number = Math.random): Shard<T> {
    const shards = [...this.descriptors.values()].filter((d) => d.healthy);
    if (shards.length === 0) throw new Error('No healthy shards');
    const totalWeight = shards.reduce((s, d) => s + d.writeWeight, 0);
    let r = random() * totalWeight;
    for (const d of shards) {
      r -= d.writeWeight;
      if (r <= 0) return this.router.shardNamed(d.name);
    }
    return this.router.shardNamed(shards[shards.length - 1].name);
  }

  /** Marks a shard's health (heartbeat-driven). */
  setHealthy(name: string, healthy: boolean): void {
    const d = this.descriptors.get(name);
    if (d) d.healthy = healthy;
  }

  /** Adjusts a shard's write weight (e.g. reduce as it fills). */
  setWriteWeight(name: string, weight: number): void {
    const d = this.descriptors.get(name);
    if (d) d.writeWeight = Math.max(0.01, weight);
  }

  descriptor(name: string): ShardDescriptor | undefined {
    const d = this.descriptors.get(name);
    return d ? { ...d } : undefined;
  }
}
