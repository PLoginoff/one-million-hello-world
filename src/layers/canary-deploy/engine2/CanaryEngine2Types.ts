/**
 * Canary Deploy — Engine 2 Types
 *
 * Types for the second-generation canary subsystem:
 *  - {@link MetricSample} / {@link MetricWindow}: raw observation stream for
 *    multi-metric analysis (error rate, latency, saturation).
 *  - {@link CombinedVerdict}: a single fused verdict across all metrics.
 *  - {@link RollbackTrigger}: automated rollback rules evaluated every window.
 *  - {@link PromotionGate}: manual + automated gates before full promotion.
 *  - {@link ShadowComparison}: live-vs-shadow response comparison.
 *
 * @module CanaryDeploy/Engine2
 */

/** Injectable clock — epoch ms. */
export type Engine2Clock = () => number;

/** A single metric observation with cohort tag. */
export interface MetricSample {
  readonly metric: string;
  /** 'live' = production cohort, 'canary' = canary cohort. */
  readonly cohort: 'live' | 'canary';
  readonly value: number;
  readonly at: number;
}

/** Aggregation of one metric over a time window. */
export interface MetricWindow {
  readonly metric: string;
  readonly cohort: 'live' | 'canary';
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly count: number;
  readonly mean: number;
  readonly stddev: number;
  readonly min: number;
  readonly max: number;
  /** Fraction of samples ≥ `errorThreshold` (default ≥1). */
  readonly errorRate: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

/** Direction of "worse" for a metric. */
export type MetricDirection = 'higher-is-worse' | 'lower-is-worse';

/** Per-metric tolerance: how much worse canary may be before failing. */
export interface MetricTolerance {
  readonly metric: string;
  readonly direction: MetricDirection;
  /**
   * Relative degradation allowed (e.g. 0.05 = canary may be 5% worse).
   * Evaluated as canary ≤ live × (1+rel) for higher-is-worse, and
   * canary ≥ live × (1−rel) for lower-is-worse.
   */
  readonly relative: number;
  /** Hard absolute bound — overrides relative when set. */
  readonly absolute?: number;
  /** Weight of this metric in the combined score (normalized internally). */
  readonly weight: number;
  /** Minimum canary samples before this metric may produce a verdict. */
  readonly minSamples: number;
}

/** Per-metric contribution to the combined verdict. */
export interface MetricContribution {
  readonly metric: string;
  readonly canary: MetricWindow;
  readonly live: MetricWindow;
  /** 'pass' | 'degraded' | 'fail' | 'insufficient'. */
  readonly verdict: 'pass' | 'degraded' | 'fail' | 'insufficient';
  /** Normalized deviation ∈ [-1,+1] (negative = worse than allowed). */
  readonly deviation: number;
  readonly reason: string;
}

/** Fused verdict across all metrics. */
export interface CombinedVerdict {
  readonly at: number;
  /** 'healthy' | 'degraded' | 'unhealthy' | 'insufficient-data'. */
  readonly status: 'healthy' | 'degraded' | 'unhealthy' | 'insufficient-data';
  /** Aggregate health score ∈ [0,1] — 1 = canary identical to live. */
  readonly score: number;
  readonly contributions: ReadonlyArray<MetricContribution>;
  readonly failingMetrics: ReadonlyArray<string>;
  readonly insufficientMetrics: ReadonlyArray<string>;
  readonly reason: string;
}

/* ------------------------------------------------------------------ */
/* Rollback triggers                                                    */
/* ------------------------------------------------------------------ */

/** Condition that, when sustained, triggers automated rollback. */
export interface RollbackTrigger {
  readonly name: string;
  /**
   * Trigger predicate over the combined verdict.
   * Returns a non-null reason string when the trigger fires.
   */
  readonly predicate: (v: CombinedVerdict) => string | null;
  /** Consecutive windows the predicate must fire before rollback. */
  readonly sustainedWindows: number;
  /** Cooldown after firing during which the trigger is suppressed (ms). */
  readonly cooldownMs?: number;
  /** Severity — informational only, but useful for alerting tiering. */
  readonly severity: 'warn' | 'critical';
}

/** Record of a rollback decision. */
export interface RollbackDecision {
  readonly trigger: string;
  readonly at: number;
  readonly reason: string;
  readonly verdict: CombinedVerdict;
}

/* ------------------------------------------------------------------ */
/* Promotion gates                                                      */
/* ------------------------------------------------------------------ */

export type PromotionGateKind = 'automated' | 'manual';

/** Gate that must pass before a canary is promoted to 100%. */
export interface PromotionGate {
  readonly name: string;
  readonly kind: PromotionGateKind;
  /**
   * For automated gates: predicate over the last `windowCount` verdicts —
   * returns a non-null reason string when the gate FAILS, null when it
   * passes. Manual gates ignore this and require explicit approval.
   */
  readonly predicate?: (history: ReadonlyArray<CombinedVerdict>) => string | null;
  /** How many trailing verdicts the predicate inspects. */
  readonly windowCount?: number;
}

export interface GateState {
  readonly gate: string;
  readonly kind: PromotionGateKind;
  readonly satisfied: boolean;
  /** For manual gates: who approved and when. */
  readonly approvedBy?: string;
  readonly approvedAt?: number;
  readonly reason: string;
}

/* ------------------------------------------------------------------ */
/* Traffic mirroring comparison (shadow vs live)                        */
/* ------------------------------------------------------------------ */

/** One shadowed request/response pair. */
export interface ShadowExchange {
  readonly requestId: string;
  readonly path: string;
  readonly live: {
    readonly status: number;
    readonly body: unknown;
    readonly latencyMs: number;
  };
  readonly shadow: {
    readonly status?: number;
    readonly body?: unknown;
    readonly latencyMs?: number;
    readonly error?: string;
  };
  readonly at: number;
}

/** Classification of one exchange divergence. */
export type DivergenceKind =
  | 'status-mismatch'
  | 'body-mismatch'
  | 'shadow-error'
  | 'timeout'
  | 'none';

export interface Divergence {
  readonly requestId: string;
  readonly path: string;
  readonly kind: DivergenceKind;
  /** JSON paths that differed (dot-separated). */
  readonly diffPaths: ReadonlyArray<string>;
  readonly liveStatus?: number;
  readonly shadowStatus?: number;
  readonly shadowError?: string;
  readonly latencyDeltaMs?: number;
}

/** Aggregate comparison statistics over a set of exchanges. */
export interface MirrorComparisonReport {
  readonly total: number;
  readonly identical: number;
  readonly diverged: number;
  readonly errored: number;
  /** Fraction of exchanges whose shadow response diverged or errored. */
  readonly divergenceRate: number;
  /** Divergences grouped by kind. */
  readonly byKind: Readonly<Record<string, number>>;
  /** Paths with highest divergence counts (top-N). */
  readonly hotPaths: ReadonlyArray<{ path: string; divergences: number }>;
  /** Latency comparison (ms) over exchanges where shadow answered. */
  readonly latency: {
    readonly liveP50: number;
    readonly shadowP50: number;
    readonly liveP99: number;
    readonly shadowP99: number;
    /** shadow p99 − live p99 (positive = shadow slower). */
    readonly p99Delta: number;
  };
}
