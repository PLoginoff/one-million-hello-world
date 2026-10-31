/**
 * Sharding Engine — shared types.
 *
 * The repository layer's engine already covers single-node concerns (spec
 * compilation, cursor pagination, optimistic-lock storage). This module adds
 * the DISTRIBUTED storage concerns a real data layer needs:
 *
 *   - Shard routing (consistent-hash ring with virtual nodes)
 *   - Cross-shard query fan-out with k-way merge
 *   - Read/write splitting across replicas with lag awareness
 *   - Connection retry with truncated exponential backoff + jitter
 *   - Query plan analysis (full-scan detection, cost estimates)
 *   - Data masking (PII fields rewritten on read)
 *
 * All storage is in-memory; clocks and RNGs are injectable for
 * deterministic tests.
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import type { PageArgs, SortKey, SpecNode } from '../types';

/** A single shard: a name plus a backing row store. */
export interface Shard<T> {
  readonly name: string;
  readonly store: ShardStore<T>;
}

/**
 * Minimal row-store contract the sharding engine operates against. Deliberately
 * narrower than `VersionedStore` so tests and adapters can plug anything in —
 * the engine only needs insert/get/scan/delete plus a row count for the
 * planner.
 */
export interface ShardStore<T> {
  insert(row: T): T;
  get(id: string): T | null;
  scan(pred: (row: T) => boolean): T[];
  delete(id: string): boolean;
  size(): number;
}

/** Routing strategy: extracts the shard key from a row. */
export type ShardKeyFn<T> = (row: T) => string;

/** A read replica: its own store plus a simulated replication lag. */
export interface Replica<T> {
  readonly name: string;
  readonly store: ShardStore<T>;
  /** Current replication lag behind the primary (ms). */
  lagMs: number;
  /** Health flag — unhealthy replicas are skipped by routing. */
  healthy: boolean;
}

/** Options accepted by `CrossShardQuery`. */
export interface FanOutQuery {
  readonly spec: SpecNode;
  readonly sort?: readonly SortKey[];
  readonly page?: PageArgs;
}

/** Row tagged with the shard it came from (fan-out merge keeps provenance). */
export interface ShardRow<T> {
  readonly shard: string;
  readonly row: T;
}

/** Plan node kinds the analyzer recognizes. */
export type PlanNodeKind =
  | 'index-lookup'
  | 'index-scan'
  | 'full-scan'
  | 'sort'
  | 'limit';

/** One node in an estimated execution plan. */
export interface PlanNode {
  readonly kind: PlanNodeKind;
  readonly detail: string;
  /** Estimated rows this node produces. */
  readonly estRows: number;
  /** Estimated cost units (roughly "rows touched"). */
  readonly estCost: number;
  readonly children: readonly PlanNode[];
}

/** A diagnostic emitted by `QueryPlanAnalyzer`. */
export interface PlanDiagnostic {
  readonly severity: 'info' | 'warning' | 'critical';
  readonly code:
    | 'FULL_SCAN_LARGE_TABLE'
    | 'MISSING_INDEX'
    | 'SORT_NO_INDEX'
    | 'SELECTIVE_INDEX_OK'
    | 'SMALL_TABLE_SCAN_OK';
  readonly message: string;
}

/** The analyzer's verdict for one query. */
export interface PlanReport {
  readonly root: PlanNode;
  readonly diagnostics: readonly PlanDiagnostic[];
  /** True when the plan is acceptable to run as-is. */
  readonly ok: boolean;
}

/** Mask rule for a single field. */
export interface MaskRule {
  readonly field: string;
  readonly mask: MaskKind;
}

export type MaskKind =
  | 'redact' // replace with fixed string
  | 'partial' // keep last N chars, mask the rest
  | 'hash' // deterministic hash (lookup joins still work)
  | 'nullify' // replace with null
  | 'year'; // dates → Jan 1 of same year (age banding)

/** Thrown for shard-key extraction failures (missing/wrong-typed key). */
export class ShardKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShardKeyError';
  }
}

/** Thrown when an operation spans shards illegally (e.g. multi-shard write). */
export class CrossShardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossShardError';
  }
}

/** Thrown when all retries are exhausted by `ConnectionRetrier`. */
export class RetryExhaustedError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(`Operation failed after ${attempts} attempt(s): ${lastError.message}`);
    this.name = 'RetryExhaustedError';
  }
}

/** Thrown when no replica satisfies the freshness requirement. */
export class NoFreshReplicaError extends Error {
  constructor(maxLagMs: number, bestLagMs: number) {
    super(`No replica within lag budget ${maxLagMs}ms (best seen ${bestLagMs}ms)`);
    this.name = 'NoFreshReplicaError';
  }
}
