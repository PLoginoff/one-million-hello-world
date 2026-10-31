/**
 * ShardingEngine — facade composing the distributed-storage pieces.
 *
 * Owns a `ShardRouter` (consistent-hash ring), a `CrossShardQuery`
 * (scatter/gather executor), a `ReplicaSet` per shard group (read/write
 * splitting), a `QueryPlanAnalyzer` (pre-flight checks), a `DataMasker`
 * (PII on read), and a `ConnectionRetrier` (transient-fault handling).
 *
 * The facade wires them the way a real data layer does:
 *   write → plan check → route to shard → primary store → replicate
 *   read  → plan check → prune shards or fan out → merge → mask → return
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { Spec } from '../Spec';
import { SpecCompiler } from '../SpecCompiler';
import { SpecNode, SortKey } from '../types';
import { ConnectionRetrier, RetryOptions } from './ConnectionRetrier';
import { CrossShardQuery } from './CrossShardQuery';
import { DataMasker, MaskPolicy } from './DataMasker';
import { MapStore } from './MapStore';
import { QueryPlanAnalyzer, TableStats } from './QueryPlanAnalyzer';
import { ReplicaSet } from './ReplicaSet';
import { ShardRouter } from './ShardRouter';
import { MaskRule, Replica, ShardStore } from './types';

export interface ShardingEngineOptions<T> {
  readonly shardKeyField: string;
  readonly shardCount?: number;
  readonly vnodesPerShard?: number;
  readonly indexedFields?: readonly string[];
  readonly maskPolicy?: MaskPolicy;
  readonly retry?: RetryOptions;
  readonly clock?: () => number;
  readonly idOf?: (row: T) => string;
}

export class ShardingEngine<T> {
  readonly router: ShardRouter<T>;
  readonly crossShard: CrossShardQuery<T>;
  readonly planner: QueryPlanAnalyzer;
  readonly masker: DataMasker;
  readonly retrier: ConnectionRetrier;
  readonly replicas: ReplicaSet<T>;
  private readonly clock: () => number;
  private readonly idOf: (row: T) => string;
  private readonly indexedFields: readonly string[];
  private readonly compiler = new SpecCompiler();

  constructor(options: ShardingEngineOptions<T>) {
    this.clock = options.clock ?? Date.now;
    this.indexedFields = options.indexedFields ?? [];
    this.idOf = options.idOf ?? ((row) => String((row as Record<string, unknown>).id));

    this.router = new ShardRouter<T>({
      shardKeyField: options.shardKeyField,
      vnodesPerShard: options.vnodesPerShard,
    });
    this.crossShard = new CrossShardQuery<T>(this.router);
    this.planner = new QueryPlanAnalyzer();
    this.masker = new DataMasker(options.maskPolicy ?? { rules: [] });
    this.retrier = new ConnectionRetrier(options.retry);

    // A single "primary" store per engine for the replica set demo; real
    // deployments run a ReplicaSet per shard — kept one-per-engine here
    // because shards are independent maps anyway.
    this.replicas = new ReplicaSet<T>(new MapStore<T>({ idOf: this.idOf }), {
      clock: this.clock,
    });

    const n = Math.max(1, options.shardCount ?? 4);
    for (let i = 0; i < n; i++) {
      this.router.addShard(`shard-${i}`, new MapStore<T>({ idOf: this.idOf }));
    }
  }

  // ------------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------------

  /**
   * Routed insert: extract the shard key, land on exactly one shard's
   * primary store, then refresh the replica snapshot.
   */
  insert(row: T): { shard: string; stored: T } {
    const res = this.crossShard.insert(row);
    return res;
  }

  // ------------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------------

  /** Point read by shard key + id — O(1), the whole point of sharding. */
  getByKey(shardKey: string, id: string, role = 'default'): T | null {
    const row = this.crossShard.getByKey(shardKey, id);
    return row === null ? null : this.masker.maskRow(row, role);
  }

  /**
   * Smart query: when the spec pins the shard key, route to the named
   * shard(s) only; otherwise fan out. Results are masked for `role`.
   */
  query(
    spec: SpecNode,
    opts: { sort?: readonly SortKey[]; role?: string; shardKeyField?: string } = {}
  ) {
    const role = opts.role ?? 'default';
    const keyField = opts.shardKeyField;
    const keys = keyField ? this.planner.pruneShards(spec, keyField) : null;

    if (keys !== null && keys.length === 1) {
      // Single-shard read — no merge needed.
      const shard = this.router.shardForKey(keys[0]);
      const pred = this.compiler.compilePredicate<T>(Spec.of(spec));
      const filtered = shard.store.scan(pred);
      return {
        rows: this.masker.maskRows(filtered, role),
        shardsHit: [shard.name],
        prunedToSingleShard: true,
      };
    }

    const res = this.crossShard.query(spec, opts.sort);
    return {
      rows: this.masker.maskRows(
        res.page.rows.map((r) => r.row),
        role
      ),
      shardsHit: res.shardsHit,
      prunedToSingleShard: false,
      failedShards: res.failedShards,
    };
  }

  /** Plan a query without executing — the "EXPLAIN" surface. */
  explain(spec: SpecNode, sort: readonly SortKey[], stats: TableStats) {
    return this.planner.analyze(spec, sort, this.indexedFields, stats);
  }

  /** Registers a read replica on the engine's primary replica set. */
  addReplica(name: string, store?: ShardStore<T>): Replica<T> {
    return this.replicas.addReplica(name, store ?? new MapStore<T>({ idOf: this.idOf }));
  }

  /** Mask a caller-supplied row collection (e.g. after a hand-rolled scan). */
  maskRows(rows: readonly T[], role = 'default'): T[] {
    return this.masker.maskRows(rows, role);
  }
}

