/**
 * Analytics Engine — shared types.
 *
 * Vocabulary:
 * - `FunnelAnalyzer`    — ordered/unordered funnel conversion with
 *                          per-step drop-off attribution.
 * - `CohortRetention`   — signup-week cohorts × retained-% per week.
 * - `SessionStitcher`   — merges anonymous device sessions into a
 *                          resolved user timeline on identify().
 * - `MetricRollup`      — pre-aggregated hourly/daily metric cubes
 *                          with tag slicing.
 *
 * All state is plain data (Maps of records). Every clock is
 * injectable so retention/window math is fully deterministic
 * under test.
 *
 * @module AnalyticsLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Millisecond clock. All engine classes accept one. */
export interface AnalyticsClock {
  now(): number;
}

/** Wall clock. */
export class SystemAnalyticsClock implements AnalyticsClock {
  now(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests. */
export class ManualAnalyticsClock implements AnalyticsClock {
  private _t = 0;
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
/* Events                                                              */
/* ------------------------------------------------------------------ */

/** One analytics event as ingested by the engine. */
export interface AnalyticsEvent {
  /** Event name, e.g. 'page_view', 'add_to_cart', 'purchase'. */
  readonly name: string;
  /** Epoch millis when the event occurred. */
  readonly timestamp: number;
  /** Resolved user id once identified; absent while anonymous. */
  readonly userId?: string;
  /** Device-scoped anonymous id (cookie / install id). */
  readonly anonymousId?: string;
  /** Session id assigned by the tracker; absent = unstitched. */
  readonly sessionId?: string;
  /** Free-form event properties (utm tags, product ids, ...). */
  readonly properties?: Readonly<Record<string, string | number | boolean>>;
}

/* ------------------------------------------------------------------ */
/* Funnel                                                              */
/* ------------------------------------------------------------------ */

/** Funnel ordering semantics. */
export type FunnelMode =
  /** Steps must occur in the declared order (classic funnel). */
  | 'ordered'
  /** Each step must occur at least once; order is irrelevant. */
  | 'unordered';

export interface FunnelOptions {
  readonly mode?: FunnelMode;
  /**
   * Conversion window in ms: a user's journey only counts if all
   * steps complete within this span from the first step.
   * 0 = no window.
   */
  readonly conversionWindowMs?: number;
}

/** Per-step funnel outcome for a cohort of users. */
export interface FunnelStepResult {
  /** Step position (0-based). */
  readonly step: number;
  /** Step event name. */
  readonly name: string;
  /** Users who reached this step. */
  readonly count: number;
  /** count / entrants of step 0. */
  readonly conversionFromStart: number;
  /** count / count of previous step (1 for step 0). */
  readonly conversionFromPrevious: number;
  /** Users lost between previous step and this one. */
  readonly droppedFromPrevious: number;
}

/**
 * Attribution for one drop-off: which property value was most
 * over-represented among users who dropped at this step vs. those
 * who continued — the "why did they leave" signal.
 */
export interface DropOffAttribution {
  readonly step: number;
  readonly property: string;
  readonly value: string;
  /** share of dropped users carrying this value. */
  readonly droppedShare: number;
  /** share of continuing users carrying this value. */
  readonly continuedShare: number;
  /** droppedShare - continuedShare; positive = over-represented. */
  readonly lift: number;
}

export interface FunnelReport {
  readonly mode: FunnelMode;
  readonly entrants: number;
  readonly steps: readonly FunnelStepResult[];
  readonly attributions: readonly DropOffAttribution[];
}

/* ------------------------------------------------------------------ */
/* Cohort retention                                                    */
/* ------------------------------------------------------------------ */

export interface CohortOptions {
  /** Length of one period in ms. Default: 7 days. */
  readonly periodMs?: number;
  /** Number of periods to report (excluding period 0). */
  readonly periods?: number;
  /** Event names that count as "activity". Empty = any event. */
  readonly activityEvents?: readonly string[];
}

/** One cell of the retention matrix. */
export interface RetentionCell {
  /** Period offset (0 = signup period, always 100%). */
  readonly period: number;
  /** Users active in this period. */
  readonly active: number;
  /** active / cohortSize. */
  readonly retained: number;
}

export interface CohortRow {
  /** First millisecond of the cohort's signup period. */
  readonly cohortStart: number;
  readonly cohortSize: number;
  readonly cells: readonly RetentionCell[];
}

export interface CohortReport {
  readonly periodMs: number;
  readonly rows: readonly CohortRow[];
}

/* ------------------------------------------------------------------ */
/* Session stitching                                                   */
/* ------------------------------------------------------------------ */

/** A stitched identity: one user + the anonymous ids merged into it. */
export interface StitchedIdentity {
  readonly userId: string;
  readonly anonymousIds: readonly string[];
  /** First-seen timestamp across all merged ids. */
  readonly firstSeen: number;
  /** Last-seen timestamp. */
  readonly lastSeen: number;
  /** Total events attributed after stitching. */
  readonly eventCount: number;
}

export interface StitchReport {
  readonly userId: string;
  readonly anonymousId: string;
  /** Events re-attributed from anonymous → user by this stitch. */
  readonly reattributedEvents: number;
  /** Sessions merged. */
  readonly mergedSessions: number;
}

/* ------------------------------------------------------------------ */
/* Metric rollups                                                      */
/* ------------------------------------------------------------------ */

/** Rollup granularity. */
export type RollupGrain = 'hour' | 'day';

export interface MetricPoint {
  /** Metric name, e.g. 'revenue', 'signups'. */
  readonly metric: string;
  /** Value to add into the rollup. */
  readonly value: number;
  /** Epoch millis; bucketed down to the grain. */
  readonly timestamp: number;
  /** Tag dimensions for slicing, e.g. { country: 'us' }. */
  readonly tags?: Readonly<Record<string, string>>;
}

/** Aggregate counters for one cube cell. */
export interface RollupCell {
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

export interface RollupQuery {
  readonly metric: string;
  readonly grain: RollupGrain;
  /** Inclusive bucket-start range. */
  readonly from?: number;
  readonly to?: number;
  /** Require these tag values on the cell. */
  readonly tags?: Readonly<Record<string, string>>;
}

export interface RollupBucket {
  /** First millisecond of the bucket. */
  readonly bucketStart: number;
  readonly cell: RollupCell;
}
