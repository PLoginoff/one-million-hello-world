/**
 * ShardRebalancer — post-scale key migration via ring-ownership diff.
 *
 * Adding/removing a shard on a consistent-hash ring remaps ~1/n of keys —
 * the point of the ring. But the ring only tells you the NEW owner of each
 * key; somebody has to actually MOVE the rows sitting on the old shard.
 * That's the rebalancer's job: diff ownership before/after a ring change,
 * produce a migration plan, and execute it in bounded chunks.
 *
 * Algorithm:
 *   1. Scan every shard's rows once (O(total)); re-route each row's key on
 *      the CURRENT ring — rows whose new owner differs are the migration
 *      set (the ~1/n of keys the ring remapped).
 *   2. `execute` moves them in `batchSize` chunks: insert on destination →
 *      delete on source. At-least-once semantics — a failure mid-chunk can
 *      leave a row on both shards briefly, harmless under id-keyed upsert.
 *      `onBatch` reports after each chunk for progress/circuit-breaking.
 *
 * Why not "rescan every row on every shard twice": the ownership diff reads
 * each row's key once — you can't know what moved without checking every
 * key, but the STORE is only touched for rows that actually migrate.
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { ShardKeyFn } from './types';
import { ShardRouter } from './ShardRouter';

/** One row's required move, carrying the row so execute never re-scans. */
export interface MigrationTask<T> {
  readonly shardKey: string;
  readonly from: string;
  readonly to: string;
  readonly row: T;
}

/** The computed plan — a materialized task list, resumable by slicing. */
export interface MigrationPlan<T> {
  readonly tasks: readonly MigrationTask<T>[];
  /** Shard → count of rows that must leave it (for estimating drain time). */
  readonly perShardOut: Readonly<Record<string, number>>;
}

export interface RebalanceProgress {
  readonly moved: number;
  readonly total: number;
  readonly done: boolean;
}

export class ShardRebalancer<T> {
  private readonly keyOf: ShardKeyFn<T>;
  private readonly idOf: (row: T) => string;

  constructor(
    private readonly router: ShardRouter<T>,
    options: { shardKey: ShardKeyFn<T>; idOf?: (row: T) => string }
  ) {
    this.keyOf = options.shardKey;
    this.idOf = options.idOf ?? ((r) => String((r as Record<string, unknown>).id));
  }

  /**
   * Computes the migration set on the CURRENT ring — call after the
   * topology change (addShard/removeShard). For each shard, re-routes every
   * resident row's key; rows whose new owner differs become tasks carrying
   * the row itself, so `execute` never re-scans a store.
   *
   * O(total rows) key extractions + O(1) ring lookups each.
   */
  plan(): MigrationPlan<T> {
    const tasks: MigrationTask<T>[] = [];
    const perShardOut: Record<string, number> = {};
    for (const fromName of this.router.shardNames()) {
      const shard = this.router.shardNamed(fromName);
      for (const row of shard.store.scan(() => true)) {
        const key = this.keyOf(row);
        const to = this.router.shardForKey(key).name;
        if (to !== fromName) {
          tasks.push({ shardKey: key, from: fromName, to, row });
          perShardOut[fromName] = (perShardOut[fromName] ?? 0) + 1;
        }
      }
    }
    return { tasks, perShardOut };
  }

  /**
   * Executes `plan` in `batchSize` chunks: insert on destination, then
   * delete on source (at-least-once — a crash mid-row leaves a duplicate,
   * safe under id-keyed upsert). `onBatch` reports after each chunk.
   */
  execute(
    plan: MigrationPlan<T>,
    batchSize = 100,
    onBatch?: (p: RebalanceProgress) => void
  ): RebalanceProgress {
    let moved = 0;
    const total = plan.tasks.length;
    for (let i = 0; i < total; i += batchSize) {
      for (const task of plan.tasks.slice(i, i + batchSize)) {
        const dst = this.router.shardNamed(task.to);
        dst.store.insert(task.row);
        this.router.shardNamed(task.from).store.delete(this.idOf(task.row));
        moved++;
      }
      onBatch?.({ moved, total, done: moved >= total });
    }
    return { moved, total, done: moved >= total };
  }

  /**
   * Estimates the rebalancing cost BEFORE planning — samples K keys per
   * shard and extrapolates the migration fraction (≈1/n after adding one
   * shard to n). Cheaper than a full `plan()` when you just want the
   * blast-radius number.
   */
  estimate(samplePerShard = 20): { estMigrationFraction: number; sampled: number } {
    let sampled = 0;
    let wouldMove = 0;
    for (const fromName of this.router.shardNames()) {
      const shard = this.router.shardNamed(fromName);
      const rows = shard.store.scan(() => true).slice(0, samplePerShard);
      for (const row of rows) {
        sampled++;
        if (this.router.shardForKey(this.keyOf(row)).name !== fromName) wouldMove++;
      }
    }
    return {
      estMigrationFraction: sampled === 0 ? 0 : wouldMove / sampled,
      sampled,
    };
  }
}
