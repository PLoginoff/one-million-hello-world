/**
 * Observability Engine 2 — shared types
 *
 * Where `engine/` handles the live telemetry path (signal ingestion,
 * routing, sampling, export), `engine2/` is the *ops layer* that sits on
 * top of already-aggregated metric data points:
 *
 *   MetricDataPoint[] ──► MetricRollup      (minute/hour buckets)
 *                    ──► AlertEvaluator    (thresholds + for-duration)
 *                    ──► SloTracker        (error budget + burn rate)
 *   volume counts   ──► TelemetryCostEstimator (per-signal pricing)
 *
 * Everything here is in-memory and deterministic: time comes from an
 * injected `IClock`, never `Date.now()` directly.
 *
 * @module ObservabilityLayer/Engine2
 */

import type { Attributes, IClock, MetricDataPoint, SignalKind } from '../engine/signals';

/** Re-exported so engine2 consumers don't reach back into engine internals. */
export type { Attributes, IClock, MetricDataPoint, SignalKind };

// ---------------------------------------------------------------------------
// Metric rollup
// ---------------------------------------------------------------------------

/** Coarseness of a rollup bucket. */
export type RollupResolution = 'minute' | 'hour';

export const RESOLUTION_MS: Record<RollupResolution, number> = {
  minute: 60_000,
  hour: 3_600_000,
};

/** What the caller wants out of a bucketed series. */
export type RollupAggregate = 'avg' | 'min' | 'max' | 'sum' | 'last' | 'count' | 'rate';

/**
 * One point in a rolled-up series. `sampleCount` is how many raw data
 * points landed inside the bucket — callers should treat
 * `sampleCount === 0` buckets as absent rather than zero-valued.
 */
export interface RollupPoint {
  readonly bucketStartMs: number;
  readonly resolution: RollupResolution;
  readonly value: number;
  readonly sampleCount: number;
  readonly firstMs: number;
  readonly lastMs: number;
}

/** A time-stamped sample fed into the rollup. */
export interface RawSample {
  readonly timestampMs: number;
  readonly value: number;
  readonly attributes?: Attributes;
}

// ---------------------------------------------------------------------------
// Alert rules
// ---------------------------------------------------------------------------

export type AlertComparator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export const COMPARATORS: Record<AlertComparator, (a: number, b: number) => boolean> = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
};

/**
 * A threshold rule. `forDurationMs` implements the Prometheus `for:`
 * clause: the condition must hold continuously for that long before the
 * rule fires; a single breaching sample only *pendings* the rule.
 */
export interface AlertRule {
  readonly id: string;
  /** Metric name the rule evaluates. */
  readonly metric: string;
  /** Optional attribute subset the series must match. */
  readonly matchAttributes?: Attributes;
  readonly comparator: AlertComparator;
  readonly threshold: number;
  /** Continuous-breach requirement before firing. 0 = immediate. */
  readonly forDurationMs: number;
  /** How often `evaluate` is expected to run — used only for reporting. */
  readonly evalIntervalMs?: number;
  /** Once firing, the condition must clear for this long to resolve. */
  readonly resolveAfterMs?: number;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly summary?: string;
}

export type RuleState = 'ok' | 'pending' | 'firing';

export interface AlertInstance {
  readonly ruleId: string;
  readonly seriesKey: string;
  readonly state: RuleState;
  /** When the current continuous breach began. */
  readonly breachStartedMs?: number;
  /** When the alert transitioned to firing. */
  readonly firedAtMs?: number;
  /** When a firing alert last saw a breaching sample (resolve timer). */
  readonly clearedAtMs?: number;
  readonly lastValue?: number;
}

export interface AlertTransition {
  readonly ruleId: string;
  readonly seriesKey: string;
  readonly from: RuleState;
  readonly to: RuleState;
  readonly value: number;
  readonly atMs: number;
}

// ---------------------------------------------------------------------------
// SLO tracking
// ---------------------------------------------------------------------------

/**
 * A service-level objective over a rolling window: e.g.
 * "99.9% of requests OK over 30 days".
 */
export interface SloDefinition {
  readonly id: string;
  readonly name: string;
  /** Fraction of events that must be good, e.g. 0.999. */
  readonly target: number;
  /** Rolling window the objective is measured over. */
  readonly windowMs: number;
}

export type SloEventKind = 'good' | 'bad';

/**
 * Error budget snapshot.
 *
 * `burnRate` is the canonical multi-window measure: actual error ratio
 * divided by the budgeted ratio. burnRate 1.0 = consuming budget exactly
 * at the pace that exhausts it at window end; >1 = exhausting early.
 */
export interface SloSnapshot {
  readonly sloId: string;
  readonly windowStartMs: number;
  readonly nowMs: number;
  readonly totalEvents: number;
  readonly badEvents: number;
  readonly observedRatio: number;
  /** Error budget fraction remaining (1 = full, 0 = exhausted, <0 = overdrawn). */
  readonly budgetRemaining: number;
  readonly burnRate: number;
  /** Estimated ms until budget hits zero at the current burn rate. */
  readonly exhaustionEtaMs?: number;
}

// ---------------------------------------------------------------------------
// Telemetry cost estimation
// ---------------------------------------------------------------------------

/** Per-signal pricing model — linear, per-unit, in USD. */
export interface SignalPricing {
  /** Per data point received (post-aggregation). */
  readonly perMetricPoint: number;
  /** Per log record; `perLogByte` applied to body size additionally. */
  readonly perLogRecord: number;
  readonly perLogByte: number;
  /** Per span. */
  readonly perSpan: number;
}

export const DEFAULT_PRICING: SignalPricing = {
  // Roughly in the ballpark of hosted-telemetry list prices.
  perMetricPoint: 0.000_001,
  perLogRecord: 0.000_000_5,
  perLogByte: 0.000_000_1,
  perSpan: 0.000_002,
};

export interface SignalVolume {
  readonly kind: SignalKind;
  /** Units observed in the measured window. */
  readonly units: number;
  /** Total payload bytes observed (logs only; others can report 0). */
  readonly bytes: number;
  readonly windowMs: number;
}

export interface CostLine {
  readonly kind: SignalKind;
  readonly units: number;
  /** Units/hour projection. */
  readonly unitsPerHour: number;
  readonly cost: number;
  readonly costPerHour: number;
  readonly shareOfTotal: number;
}

export interface CostEstimate {
  readonly nowMs: number;
  readonly windowMs: number;
  readonly lines: ReadonlyArray<CostLine>;
  readonly totalCost: number;
  readonly projectedCostPerHour: number;
  readonly projectedCostPerDay: number;
}
