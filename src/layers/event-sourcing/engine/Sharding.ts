/**
 * Sharding — stream→shard placement for the sharded event store.
 *
 * Two placement strategies with different trade-offs:
 *
 *   ConsistentHashRing — the classic Dynamo-style ring. Each physical
 *   shard owns `vnodeCount` virtual nodes spread around a 32-bit hash
 *   ring; a stream maps to the shard owning the first vnode clockwise
 *   from the stream's hash. Removing a shard only redistributes its
 *   vnodes' arcs — expected key movement is ~1/N of the keyspace for
 *   N shards (vs ~100% for `hash % N`). Adding a shard steals ~1/N.
 *
 *   RendezvousHasher — highest-random-weight (HRW) hashing: for each
 *   stream, score every shard as hash(stream ‖ shard) and pick the
 *   argmax. O(N) per lookup vs O(log V) for the ring, but zero memory,
 *   perfectly uniform, and removal/addition move only the minimal set —
 *   there is no ring topology to skew. Preferred when the shard count is
 *   small and lookups are not the bottleneck (event stores are
 *   append-dominated; appends route once per batch).
 *
 * Both satisfy the `ShardMap` interface consumed by `ShardedEventStore`,
 * which re-asks `shardOf` on every append — so `addShard`/`removeShard`
 * are live topology changes, not rebuilds.
 *
 * Hash function: FNV-1a 32-bit. Chosen over e.g. murmur because it needs
 * no dependencies, is deterministic across platforms (important when the
 * same stream id must route identically on primary and replica), and its
 * avalanche quality is sufficient for vnode placement.
 *
 * @module EventSourcing/Engine
 */

// ---------------------------------------------------------------------
// Hashing primitives
// ---------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash of a string. Returns an unsigned 32-bit integer.
 *
 * Complexity: O(n) in string length, single pass, ~1 cycle/byte.
 * Properties: deterministic, platform-independent, decent avalanche for
 * short keys. NOT cryptographic — do not use for MACs or signatures.
 */
export function fnv1a(input: string): number {
  // 2166136261 = 0x811c9dc5 offset basis; 16777619 = 0x01000193 prime.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Multiply by FNV prime using shifts to stay in 32-bit integer math:
    // h * 16777619 = h + (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24).
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Combine two 32-bit hashes — used to bind a record's checksum to the
 * checksum of the segment chain that precedes it (see
 * `StoreIntegrityVerifier`). Order-sensitive by construction.
 */
export function chainHash(previous: number, next: number): number {
  // Boost hash_combine: h = prev ^ (next + 0x9e3779b9 + (prev<<6) + (prev>>2)).
  return (previous ^ ((next + 0x9e3779b9 + ((previous << 6) >>> 0) + (previous >>> 2)) >>> 0)) >>> 0;
}

/** Hex-encode a 32-bit hash for display / checksum comparison reports. */
export function hex32(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------
// ShardMap abstraction
// ---------------------------------------------------------------------

/**
 * Placement strategy: stream id → shard id.
 *
 * Implementations must be **deterministic**: a primary and its replicas
 * construct the same map from the same shard id list and must agree on
 * placement, or replication (which ships shard-local records) would
 * cross-shuffle data.
 */
export interface ShardMap {
  /** Shard that owns `streamId` under the current topology. */
  shardOf(streamId: string): string;
  /** Current physical shard ids, in registration order. */
  shardIds(): readonly string[];
  /**
   * Register a new shard. Implementations return nothing; callers that
   * need the migration plan ask `ShardedEventStore.addShard`, which
   * rehashes the keyspace and reports moved streams.
   */
  addShard(shardId: string): void;
  /**
   * De-register a shard. Its vnodes leave the ring / its candidates leave
   * the HRW pool; subsequent `shardOf` calls route around it.
   */
  removeShard(shardId: string): void;
  /** Number of physical shards. */
  size(): number;
}

// ---------------------------------------------------------------------
// Consistent hashing
// ---------------------------------------------------------------------

interface VNode {
  /** Position on the ring: fnv1a(shardId + '#' + vnodeIndex). */
  readonly point: number;
  readonly shardId: string;
}

/**
 * Consistent hash ring with virtual nodes.
 *
 * Layout: `_points` is a sorted array of vnode positions. `shardOf` is a
 * binary search for the successor point — O(log(V)) where V =
 * shards × vnodeCount. With the default 160 vnodes/shard the
 * empirical stddev of arc ownership is ~5%, i.e. a 4-shard cluster sees
 * per-shard load in [23%, 27%] rather than the [13%, 37%] of 1-vnode rings.
 *
 * Ring points are 32-bit; the ring wraps, so a stream hashing above the
 * largest point maps to the first point (successor with wrap-around).
 */
export class ConsistentHashRing implements ShardMap {
  /** Sorted vnode array — invariant: ascending by `point`. */
  private _points: VNode[] = [];
  private readonly _shards: string[] = [];
  private readonly _vnodes: number;
  private readonly _hasher: (s: string) => number;

  constructor(
    shardIds: readonly string[],
    options: { vnodeCount?: number; hasher?: (s: string) => number } = {}
  ) {
    if (shardIds.length === 0) throw new Error('ConsistentHashRing needs >= 1 shard');
    this._vnodes = Math.max(1, options.vnodeCount ?? 160);
    this._hasher = options.hasher ?? fnv1a;
    for (const id of shardIds) this.addShard(id);
  }

  shardIds(): readonly string[] {
    return this._shards;
  }

  size(): number {
    return this._shards.length;
  }

  /**
   * Route a stream id to a shard. Binary search for the first vnode with
   * point >= hash(streamId); wrap to index 0 past the end. O(log V).
   */
  shardOf(streamId: string): string {
    const h = this._hasher(streamId);
    let lo = 0;
    let hi = this._points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._points[mid].point < h) lo = mid + 1;
      else hi = mid;
    }
    if (lo === this._points.length) lo = 0; // wrap around the ring
    return this._points[lo].shardId;
  }

  /**
   * Insert `vnodeCount` new points for the shard and re-sort.
   * Cost: O(V log V) — done once per topology change, fine in practice.
   */
  addShard(shardId: string): void {
    if (this._shards.includes(shardId)) return;
    this._shards.push(shardId);
    for (let i = 0; i < this._vnodes; i++) {
      this._points.push({ point: this._hasher(`${shardId}#${i}`), shardId });
    }
    this._points.sort((a, b) => a.point - b.point);
  }

  /**
   * Drop all vnodes of `shardId`. O(V) filter. Removing the last shard is
   * rejected — a shard map with no owner cannot route.
   */
  removeShard(shardId: string): void {
    const idx = this._shards.indexOf(shardId);
    if (idx === -1) return;
    if (this._shards.length === 1) {
      throw new Error('cannot remove the last shard from the ring');
    }
    this._shards.splice(idx, 1);
    this._points = this._points.filter((p) => p.shardId !== shardId);
  }

  /**
   * Diagnostics: fraction of the ring owned per shard (sum of arc lengths
   * divided by 2^32). Used by tests and rebalance planners to detect a
   * skewed ring before it becomes a hot shard in production.
   */
  ownership(): Record<string, number> {
    const owned = new Map<string, number>();
    for (const id of this._shards) owned.set(id, 0);
    for (let i = 0; i < this._points.length; i++) {
      const cur = this._points[i];
      const next = this._points[(i + 1) % this._points.length];
      const arc = (next.point - cur.point + 0x1_0000_0000) % 0x1_0000_0000;
      owned.set(cur.shardId, (owned.get(cur.shardId) ?? 0) + arc / 0x1_0000_0000);
    }
    const out: Record<string, number> = {};
    for (const [k, v] of owned) out[k] = v;
    return out;
  }
}

// ---------------------------------------------------------------------
// Rendezvous (HRW) hashing
// ---------------------------------------------------------------------

/**
 * Rendezvous / highest-random-weight hashing.
 *
 * `shardOf(k) = argmax_s hash(k ‖ s)`. Properties:
 *   - Minimal disruption: removing shard S reassigns exactly the keys
 *     that had S as argmax (~1/N of the keyspace); nothing else moves.
 *   - No memory: no ring to maintain. Lookup cost is O(N) hashes — with
 *     FNV-1a over short combined keys this is microseconds even at N=64.
 *   - Perfectly uniform: every shard is equally likely argmax a priori
 *     (empirically ~1/N ± small variance for large key counts).
 *
 * Weighted variant: `weight` multiplies a shard's score by a positive
 * factor — a bigger node draws proportionally more streams. Weight 0 is
 * rejected (a zero-weight argmax could still win if it were the only
 * shard, silently breaking capacity math).
 */
export class RendezvousHasher implements ShardMap {
  private readonly _shards = new Map<string, number>(); // id -> weight
  private readonly _hasher: (s: string) => number;

  constructor(
    shardIds: readonly (string | { id: string; weight: number })[],
    options: { hasher?: (s: string) => number } = {}
  ) {
    if (shardIds.length === 0) throw new Error('RendezvousHasher needs >= 1 shard');
    this._hasher = options.hasher ?? fnv1a;
    for (const s of shardIds) {
      if (typeof s === 'string') this.addShard(s);
      else this.addShard(s.id, s.weight);
    }
  }

  shardIds(): readonly string[] {
    return [...this._shards.keys()];
  }

  size(): number {
    return this._shards.size;
  }

  /** O(N) — hash each candidate and keep the argmax. */
  shardOf(streamId: string): string {
    let best: string | null = null;
    let bestScore = -1;
    for (const [id, weight] of this._shards) {
      // Unsigned 32-bit score in (0, 2^32] — multiply by weight then pick max.
      const score = (this._hasher(`${streamId}${id}`) + 1) * weight;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    // Non-null: _shards is never empty (constructor + removeShard guard).
    return best as string;
  }

  addShard(shardId: string, weight = 1): void {
    if (weight <= 0) throw new Error(`shard '${shardId}': weight must be > 0`);
    this._shards.set(shardId, weight);
  }

  removeShard(shardId: string): void {
    if (this._shards.size <= 1 && this._shards.has(shardId)) {
      throw new Error('cannot remove the last shard');
    }
    this._shards.delete(shardId);
  }

  /**
   * Deterministic ranking of all shards for a key — argmax is [0].
   * Exposed for debugging ("which shard *would* own this stream if X died").
   */
  rank(streamId: string): string[] {
    const scored: { id: string; score: number }[] = [];
    for (const [id, weight] of this._shards) {
      scored.push({ id, score: (this._hasher(`${streamId}${id}`) + 1) * weight });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.id);
  }
}
