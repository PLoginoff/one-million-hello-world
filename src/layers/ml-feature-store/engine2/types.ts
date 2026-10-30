/**
 * ML Feature Store — Engine 2 shared types
 *
 * `engine/` covers storage mechanics (online lookup, offline PIT join,
 * registry). `engine2/` covers *data quality and governance*:
 *
 *   DriftDetector        — distribution shift per feature (PSI + KS)
 *   FeatureLineageGraph  — pipeline → feature → model provenance
 *   ConsistencyChecker   — online vs offline value agreement
 *   FeatureCache         — per-feature-TTL read-through cache
 *
 * @module MlFeatureStoreLayer/Engine2
 */

import type { IClock } from '../../observability/engine/signals';
import type { FeatureValue } from '../engine/FeatureStore';

export type { IClock, FeatureValue };

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

/** How the drift detector summarises a feature's distribution. */
export type DriftMethod = 'psi' | 'ks';

export interface DriftResult {
  readonly feature: string;
  readonly method: DriftMethod;
  /** PSI: ≥0, <0.1 stable, 0.1-0.25 moderate, >0.25 shifted.
   *  KS: 0..1 max CDF gap. */
  readonly statistic: number;
  readonly drifted: boolean;
  readonly threshold: number;
  readonly referenceCount: number;
  readonly currentCount: number;
}

/** Numeric sample windows for one feature. */
export interface FeatureWindow {
  readonly feature: string;
  readonly reference: ReadonlyArray<number>;
  readonly current: ReadonlyArray<number>;
}

// ---------------------------------------------------------------------------
// Feature lineage
// ---------------------------------------------------------------------------

export interface PipelineRun {
  readonly pipelineId: string;
  readonly runId: string;
  readonly startedMs: number;
  readonly endedMs?: number;
  /** Features this run produced. */
  readonly producedFeatures: ReadonlyArray<string>;
  /** Upstream inputs the pipeline read (tables / other features). */
  readonly inputs: ReadonlyArray<string>;
  readonly status: 'running' | 'succeeded' | 'failed';
}

export interface FeatureNode {
  readonly feature: string;
  /** Pipeline runs that produced this feature, newest first. */
  readonly producedBy: ReadonlyArray<PipelineRun>;
  /** Models registered as consumers of this feature. */
  readonly consumers: ReadonlyArray<string>;
}

export interface LineageEdge {
  readonly from: string; // pipeline runId or input name
  readonly to: string;   // feature name or model id
  readonly kind: 'produces' | 'consumes' | 'reads';
}

// ---------------------------------------------------------------------------
// Consistency checks
// ---------------------------------------------------------------------------

export interface ConsistencySample {
  readonly entity: string;
  readonly feature: string;
  readonly onlineValue: FeatureValue;
  readonly offlineValue: FeatureValue;
  readonly atMs: number;
}

export interface ConsistencyReport {
  readonly feature: string;
  readonly checked: number;
  readonly matched: number;
  readonly mismatched: number;
  /** Fraction in agreement (1 = perfect parity). */
  readonly agreement: number;
  readonly samples: ReadonlyArray<ConsistencySample>;
}

// ---------------------------------------------------------------------------
// Feature caching
// ---------------------------------------------------------------------------

export interface CacheEntryMeta {
  readonly feature: string;
  readonly storedAtMs: number;
  readonly expiresAtMs: number;
  readonly hits: number;
}

export interface FeatureCacheConfig {
  /** Per-feature TTL override (ms); falls back to the feature's own TTL. */
  readonly defaultTtlMs: number;
  /** Bound on cached entries (LRU evict beyond this). */
  readonly maxEntries: number;
}

export interface FeatureCacheStats {
  readonly entries: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly hitRate: number;
}
