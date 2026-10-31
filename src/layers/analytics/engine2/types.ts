/**
 * Analytics Engine2 — Shared Types
 *
 * Third-generation analytics primitives:
 *
 * - `SlidingWindowAggregator` — per-metric sliding-window counters,
 *    heavy-hitter top-N lists and sparkline series, all bucketized so
 *    memory is bounded by the window/bucket ratio, not by event count.
 * - `EventTracker`            — schema-validated custom event intake
 *    with deterministic sampling and per-schema statistics.
 * - `AttributionModeler`      — first-touch / last-touch / linear /
 *    time-decay / position-based conversion credit over marketing
 *    touchpoint journeys.
 *
 * All state is plain data. Every clock is injectable so window
 * arithmetic, TTLs and decay are fully deterministic under test.
 *
 * @module AnalyticsLayer/Engine2
 */

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Millisecond clock. All engine classes accept one. */
export interface AnalyticsClock2 {
  now(): number;
}

/** Wall clock. */
export class SystemAnalyticsClock2 implements AnalyticsClock2 {
  now(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests. */
export class ManualAnalyticsClock2 implements AnalyticsClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Sliding-window aggregation                                          */
/* ------------------------------------------------------------------ */

/** What a sliding window accumulates per bucket. */
export type AggregateKind = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface SlidingWindowOptions {
  /**
   * Bucket granularity in ms. Smaller buckets = smoother windows and
   * more memory. The window keeps `ceil(windowMs / bucketMs)` live
   * buckets per metric.
   */
  readonly bucketMs: number;
  /** Total lookback span served by `aggregate()`. */
  readonly windowMs: number;
  /** Injectable clock; defaults to the system clock. */
  readonly clock?: AnalyticsClock2;
  /** Cap on tracked dimensions per top-N list (default 512). */
  readonly maxDimensions?: number;
}

/** One data point fed into the window. */
export interface WindowPoint {
  /** Metric name, e.g. `api.latency`, `orders.count`. */
  readonly metric: string;
  /** Numeric value; ignored for `count` (each point = 1). */
  readonly value?: number;
  /** Epoch millis; defaults to clock.now(). */
  readonly timestamp?: number;
}

/** Aggregate value over the live window for one metric. */
export interface WindowAggregate {
  readonly metric: string;
  readonly kind: AggregateKind;
  /** Points contributing to the value. */
  readonly samples: number;
  /** Aggregated value; `NaN` for `avg` with zero samples. */
  readonly value: number;
  /** First millisecond covered by the window (exclusive of older). */
  readonly windowStart: number;
  readonly windowEnd: number;
}

/** One bucket of a sparkline series, oldest first. */
export interface SparklineBucket {
  /** First millisecond of the bucket. */
  readonly start: number;
  /** Aggregated value for the bucket; `null` = empty bucket. */
  readonly value: number | null;
}

export interface Sparkline {
  readonly metric: string;
  readonly kind: AggregateKind;
  readonly bucketMs: number;
  readonly buckets: readonly SparklineBucket[];
}

/* ------------------------------------------------------------------ */
/* Top-N heavy hitters                                                 */
/* ------------------------------------------------------------------ */

/** One entry in a top-N list. */
export interface TopNEntry {
  /** Dimension value, e.g. a URL or user id. */
  readonly key: string;
  readonly count: number;
  /** Share of total hits tracked in the list. */
  readonly share: number;
}

export interface TopNList {
  /** Entries sorted by count desc, key asc for stability. */
  readonly entries: readonly TopNEntry[];
  /** Total hits seen (including evicted dimensions). */
  readonly total: number;
  /** True when low-count dimensions were evicted by the cap. */
  readonly truncated: boolean;
}

/* ------------------------------------------------------------------ */
/* Custom event tracking                                               */
/* ------------------------------------------------------------------ */

/** Primitive property types the event schema supports. */
export type EventFieldType = 'string' | 'number' | 'boolean';

export interface EventFieldSpec {
  readonly type: EventFieldType;
  /** When true the property may be omitted. */
  readonly optional?: boolean;
  /** Allowed values (strings only); undefined = any string. */
  readonly enum?: readonly string[];
  /** Inclusive numeric bounds (numbers only). */
  readonly min?: number;
  readonly max?: number;
}

/**
 * Schema for one event name: a closed set of typed properties.
 * Unknown properties are rejected unless `allowExtra` is set.
 */
export interface EventSchema {
  /** Event name, e.g. `checkout_completed`. */
  readonly name: string;
  /** Required/optional typed properties. */
  readonly fields: Readonly<Record<string, EventFieldSpec>>;
  /** Allow properties not declared in `fields` (default false). */
  readonly allowExtra?: boolean;
  /**
   * Sampling rate in [0, 1] applied *after* validation. Sampled-out
   * events are counted but not stored. Default 1 (keep everything).
   */
  readonly sampleRate?: number;
}

/** A tracked event as submitted by a caller. */
export interface TrackedEventInput {
  readonly name: string;
  readonly properties?: Readonly<Record<string, string | number | boolean>>;
  /** Anonymous or authenticated subject id. */
  readonly subjectId?: string;
  /** Epoch millis; defaults to clock.now(). */
  readonly timestamp?: number;
}

/** A validated, sampled-in event stored by the tracker. */
export interface TrackedEvent {
  readonly name: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
  readonly subjectId?: string;
  readonly timestamp: number;
  /** Monotonic sequence assigned by the tracker (starts at 1). */
  readonly seq: number;
}

/** Why an event failed validation. */
export interface ValidationIssue {
  readonly field: string;
  readonly reason:
    | 'missing-required'
    | 'wrong-type'
    | 'out-of-range'
    | 'not-in-enum'
    | 'unknown-field'
    | 'unknown-event';
  readonly detail: string;
}

export interface TrackResult {
  readonly accepted: boolean;
  /** Event name. */
  readonly name: string;
  /** True when the event validated but was sampled out. */
  readonly sampledOut: boolean;
  readonly issues: readonly ValidationIssue[];
}

/** Per-schema intake counters. */
export interface EventSchemaStats {
  readonly name: string;
  /** Validation passes (before sampling). */
  readonly valid: number;
  /** Validation failures. */
  readonly invalid: number;
  /** Valid events dropped by sampling. */
  readonly sampledOut: number;
  /** Events actually stored. */
  readonly stored: number;
}

/* ------------------------------------------------------------------ */
/* Attribution modeling                                                */
/* ------------------------------------------------------------------ */

/** Supported credit-distribution models. */
export type AttributionModel =
  /** 100% to the first touchpoint. */
  | 'first-touch'
  /** 100% to the last touchpoint. */
  | 'last-touch'
  /** Equal credit to every touchpoint. */
  | 'linear'
  /** Exponential decay: newer touches earn more (half-life based). */
  | 'time-decay'
  /** 40% first + 40% last + 20% spread over the middle. */
  | 'position-based';

/** One marketing touch on a subject's journey. */
export interface Touchpoint {
  /** Channel or campaign, e.g. `paid-search`, `email`, `organic`. */
  readonly channel: string;
  /** Epoch millis of the touch. */
  readonly timestamp: number;
  /** Optional finer-grained source, e.g. `newsletter-oct`. */
  readonly source?: string;
}

/** A conversion attributed back over a journey. */
export interface Conversion {
  /** Conversion time; touches after this are excluded. */
  readonly timestamp: number;
  /** Monetary or unit value distributed across touches. */
  readonly value?: number;
  /** Optional label, e.g. `plan-upgrade`. */
  readonly kind?: string;
}

export interface CreditShare {
  readonly channel: string;
  /** Sum of fractional credit [0,1] across conversions. */
  readonly credit: number;
  /** `credit` scaled by conversion value. */
  readonly value: number;
  /** Share of total attributed credit. */
  readonly share: number;
}

export interface AttributionReport {
  readonly model: AttributionModel;
  /** Conversions that had at least one in-window touch. */
  readonly conversionsAttributed: number;
  /** Conversions with no eligible touchpoint (no credit emitted). */
  readonly conversionsUnattributed: number;
  /** Total value distributed. */
  readonly totalValue: number;
  readonly channels: readonly CreditShare[];
}

export interface AttributionOptions {
  /** Half-life for `time-decay` in ms (default 7 days). */
  readonly halfLifeMs?: number;
  /**
   * Lookback window in ms: only touches within this span before the
   * conversion participate. 0 = unbounded (default).
   */
  readonly lookbackMs?: number;
}
