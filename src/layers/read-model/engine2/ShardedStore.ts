/**
 * ShardedStore — entity-id hash sharding for read-model rows.
 *
 * A projection too big for one store gets partitioned by entity id:
 * shard = hash(key) mod N. Reads/writes route to one shard only —
 * no scatter-gather for point lookups.
 *
 * Hash: FNV-1a 32-bit — deterministic across processes, so routing is
 * stable without a directory service. NOT cryptographic.
 *
 * Rebalancing: `reshard(newCount)` re-maps every stored row. With plain
 * modulo most keys move — that's honest behavior for this model. Callers
 * wanting minimal movement should use the consistent-hash ring in the
 * websocket layer's ClusterRouter; here we keep modulo for simplicity
 * and document the migration cost.
 *
 * `scan` iterates all shards (scatter) — needed for backfills; point
 * `get`/`put`/`delete` hit exactly one shard.
 *
 * @module ReadModelLayer/Engine2
 */

import { ProjectionRow } from './types';

/** FNV-1a 32-bit — deterministic, non-cryptographic. */
function fnv1a(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class ShardedStore {
  private _shards: Map<string, ProjectionRow>[];
  private _shardCount: number;
  private _moves = 0;

  constructor(shardCount: number = 8) {
    if (shardCount < 1) throw new Error('shardCount must be >= 1');
    this._shardCount = Math.floor(shardCount);
    this._shards = Array.from({ length: this._shardCount }, () => new Map());
  }

  get shardCount(): number {
    return this._shardCount;
  }

  /** Total rows migrated by reshard calls. */
  get movedRows(): number {
    return this._moves;
  }

  /** Shard index for an entity key. */
  shardOf(key: string): number {
    return fnv1a(key) % this._shardCount;
  }

  private _fullKey(row: Pick<ProjectionRow, 'projection' | 'key'>): string {
    return `${row.projection}${row.key}`;
  }

  put(row: ProjectionRow): void {
    this._shards[this.shardOf(row.key)].set(this._fullKey(row), row);
  }

  get(projection: string, key: string): ProjectionRow | null {
    return this._shards[this.shardOf(key)].get(`${projection}${key}`) ?? null;
  }

  delete(projection: string, key: string): boolean {
    return this._shards[this.shardOf(key)].delete(`${projection}${key}`);
  }

  /**
   * Rows stored in the shard that owns `key` — i.e. what co-locates with
   * that entity. Useful for locality inspection.
   */
  shardContents(key: string): ProjectionRow[] {
    return [...this._shards[this.shardOf(key)].values()];
  }

  /** Scatter-gather scan over all shards. */
  *scan(): Generator<ProjectionRow> {
    for (const shard of this._shards) yield* shard.values();
  }

  /**
   * Re-partition into `newCount` shards. Moves every row whose shard
   * index changes — with modulo hashing that's most of them (≈ N-1/N
   * when doubling). Returns rows moved.
   */
  reshard(newCount: number): number {
    if (newCount < 1) throw new Error('shardCount must be >= 1');
    const all = [...this.scan()];
    this._shardCount = Math.floor(newCount);
    this._shards = Array.from({ length: this._shardCount }, () => new Map());
    let moved = 0;
    for (const row of all) {
      const idx = this.shardOf(row.key);
      this._shards[idx].set(this._fullKey(row), row);
      moved++;
    }
    this._moves += moved;
    return moved;
  }

  /** Rows per shard — balance check. */
  distribution(): number[] {
    return this._shards.map((s) => s.size);
  }
}
