/**
 * ShardRouter — consistent-hash ring shard routing.
 *
 * Naive modulo routing (`hash(key) % n`) remaps ~(n-1)/n of all keys when a
 * shard is added or removed — a full data migration. Consistent hashing
 * places each shard at V "virtual node" points on a hash ring; a key maps to
 * the first vnode clockwise from its own hash. Adding/removing one shard
 * remaps only ~1/n of keys, which is why every real sharded store
 * (Cassandra, DynamoDB, memcached clients) uses some form of this.
 *
 * Structure:
 *   - `_ring`: sorted array of vnode hash points (Uint32 values)
 *   - `_vnodeToShard`: parallel array, same index → shard name
 *   - `_shards`: name → Shard
 *
 * Lookup is binary search over the sorted ring: O(log(V·S)) where S is the
 * shard count and V the vnode count (typically 128–256 per shard).
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { getPath } from '../path';
import { Shard, ShardKeyError, ShardKeyFn, ShardStore } from './types';

export interface ShardRouterOptions<T> {
  /** Field path used as the shard key, e.g. `tenantId`. XOR with shardKeyFn. */
  readonly shardKeyField?: string;
  /** Custom key extractor (takes precedence over shardKeyField). */
  readonly shardKeyFn?: ShardKeyFn<T>;
  /** Virtual nodes per shard — higher = smoother distribution, more memory. */
  readonly vnodesPerShard?: number;
}

export class ShardRouter<T> {
  private readonly _shards = new Map<string, Shard<T>>();
  /** Sorted vnode points; `_ringOwners[i]` is the shard owning point `_ring[i]`. */
  private _ring: number[] = [];
  private _ringOwners: string[] = [];
  private readonly vnodes: number;
  private readonly keyFn: ShardKeyFn<T>;

  constructor(options: ShardRouterOptions<T> = {}) {
    if (options.shardKeyFn && options.shardKeyField) {
      throw new ShardKeyError('Provide shardKeyFn or shardKeyField, not both');
    }
    if (!options.shardKeyFn && !options.shardKeyField) {
      throw new ShardKeyError('A shardKeyFn or shardKeyField is required');
    }
    this.vnodes = Math.max(8, options.vnodesPerShard ?? 128);
    this.keyFn =
      options.shardKeyFn ??
      ((row: T) => {
        const v = getPath(row, options.shardKeyField as string);
        if (v === undefined || v === null) {
          throw new ShardKeyError(
            `Row is missing shard key field "${options.shardKeyField}"`
          );
        }
        return String(v);
      });
  }

  /** Registers a shard and rehashes the ring. O(V·S log(V·S)). */
  addShard(name: string, store: ShardStore<T>): void {
    if (this._shards.has(name)) {
      throw new ShardKeyError(`Shard "${name}" already registered`);
    }
    this._shards.set(name, { name, store });
    this.rebuildRing();
  }

  /** Removes a shard. Rows still on it are orphaned — migrate first. */
  removeShard(name: string): void {
    if (!this._shards.delete(name)) {
      throw new ShardKeyError(`Unknown shard "${name}"`);
    }
    this.rebuildRing();
  }

  /**
   * Maps a shard key to a shard name via ring lookup.
   *
   * Hashes the key to a Uint32, then binary-searches for the first vnode
   * strictly greater than the key's point; wraps to index 0 at the ring's
   * end. O(log(V·S)).
   */
  shardForKey(key: string): Shard<T> {
    if (this._shards.size === 0) {
      throw new ShardKeyError('No shards registered');
    }
    const h = fnv1a(key);
    const idx = this.upperBound(h);
    const shard = this._shards.get(this._ringOwners[idx]);
    if (!shard) throw new ShardKeyError(`Ring points at unknown shard`); // unreachable
    return shard;
  }

  /** Routes a row to its shard by extracting the key. */
  shardFor(row: T): Shard<T> {
    return this.shardForKey(this.keyFn(row));
  }

  /** Every key that would route to `shardName` — inverse mapping helper. */
  shardNamed(name: string): Shard<T> {
    const s = this._shards.get(name);
    if (!s) throw new ShardKeyError(`Unknown shard "${name}"`);
    return s;
  }

  shardNames(): string[] {
    return [...this._shards.keys()];
  }

  get shardCount(): number {
    return this._shards.size;
  }

  /**
   * Estimates what fraction of the keyspace each shard currently owns —
   * the sum of arc lengths between consecutive vnodes, normalized by 2^32.
   * Used to detect a skewed ring before real traffic lands on it.
   */
  ownershipReport(): Map<string, number> {
    const share = new Map<string, number>();
    for (const name of this._shards.keys()) share.set(name, 0);
    const n = this._ring.length;
    if (n === 0) return share;
    for (let i = 0; i < n; i++) {
      const prev = this._ring[(i - 1 + n) % n];
      const cur = this._ring[i];
      // Arc this vnode owns: (cur - prev) mod 2^32.
      const arc = (cur - prev + 0x1_0000_0000) % 0x1_0000_0000;
      const owner = this._ringOwners[i];
      share.set(owner, (share.get(owner) ?? 0) + arc / 0x1_0000_0000);
    }
    return share;
  }

  // ------------------------------------------------------------------------
  // Ring maintenance
  // ------------------------------------------------------------------------

  /**
   * Rebuilds the sorted vnode ring from the current shard set. Vnode points
   * are `fnv1a("<shard>#<i>")` — deterministic so the ring is identical across
   * processes given the same shard set and insertion order.
   */
  private rebuildRing(): void {
    const points: { h: number; owner: string }[] = [];
    for (const name of this._shards.keys()) {
      for (let i = 0; i < this.vnodes; i++) {
        points.push({ h: fnv1a(`${name}#${i}`), owner: name });
      }
    }
    points.sort((a, b) => a.h - b.h);
    this._ring = points.map((p) => p.h);
    this._ringOwners = points.map((p) => p.owner);
  }

  /**
   * Index of the first ring point > h, wrapping to 0. Standard binary
   * search over the sorted `_ring` array.
   */
  private upperBound(h: number): number {
    let lo = 0;
    let hi = this._ring.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._ring[mid] <= h) lo = mid + 1;
      else hi = mid;
    }
    return lo === this._ring.length ? 0 : lo;
  }
}

/**
 * FNV-1a 32-bit hash: simple, fast, avalanche-good-enough for routing.
 * We don't need cryptographic strength — only uniformity. Each byte xors
 * then multiplies by the FNV prime (mod 2^32 via `Math.imul`).
 */
export function fnv1a(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
