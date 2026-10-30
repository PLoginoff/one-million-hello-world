/**
 * Feature Quality Monitor — per-feature data-health tracking.
 *
 * Where `ConsistencyChecker` compares online/offline values at a point
 * in time, this monitor tracks *quality metrics over a sliding window*
 * per feature: null rate, out-of-range rate, staleness (age of the
 * newest write), and type violations. Output is a health report per
 * feature plus a `violations()` view for alerting.
 *
 * Data structure: per-feature sliding event deque (same head-pointer
 * trick as SloTracker) + running aggregates so reporting is O(1).
 *
 * @module MlFeatureStoreLayer/Engine2
 */

import { IClock, SystemClock } from '../../observability/engine/signals';
import { FeatureValue } from '../engine/FeatureStore';

export interface QualityExpectation {
  readonly feature: string;
  /** Min/max valid range for numeric features (inclusive). */
  readonly min?: number;
  readonly max?: number;
  /** Max acceptable staleness: now - lastWrite > this → violation. */
  readonly maxStalenessMs?: number;
  /** Allowed null fraction (0..1). */
  readonly maxNullRate?: number;
  /** Allowed out-of-range fraction (0..1). */
  readonly maxOutOfRangeRate?: number;
}

export interface QualityViolation {
  readonly feature: string;
  readonly kind: 'null-rate' | 'range-rate' | 'stale' | 'type-mismatch';
  readonly observed: number;
  readonly limit: number;
  readonly detail: string;
}

export interface QualityReport {
  readonly feature: string;
  readonly windowMs: number;
  readonly writes: number;
  readonly nullCount: number;
  readonly outOfRangeCount: number;
  readonly typeMismatchCount: number;
  readonly nullRate: number;
  readonly outOfRangeRate: number;
  /** Age of the newest write at report time. */
  readonly stalenessMs: number;
  readonly violations: ReadonlyArray<QualityViolation>;
}

interface Obs {
  readonly atMs: number;
  readonly isNull: boolean;
  readonly outOfRange: boolean;
  readonly typeMismatch: boolean;
}

interface Runtime {
  readonly exp: QualityExpectation;
  events: Obs[];
  head: number;
  nulls: number;
  oor: number;
  typeBad: number;
  newestMs: number;
}

const WINDOW_MS = 3_600_000; // 1h sliding window

export class FeatureQualityMonitor {
  private readonly _clock: IClock;
  private readonly _windowMs: number;
  private readonly _runtimes = new Map<string, Runtime>();

  constructor(windowMs = WINDOW_MS, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._windowMs = windowMs;
  }

  /** Declare expectations for a feature. */
  expect(exp: QualityExpectation): void {
    this._runtimes.set(exp.feature, {
      exp,
      events: [],
      head: 0,
      nulls: 0,
      oor: 0,
      typeBad: 0,
      newestMs: 0,
    });
  }

  /**
   * Record a feature write. `expectedType` is a cheap string check
   * ('number' | 'string' | 'boolean' | 'object').
   */
  record(feature: string, value: FeatureValue, expectedType?: string, atMs?: number): void {
    let rt = this._runtimes.get(feature);
    if (!rt) {
      rt = { exp: { feature }, events: [], head: 0, nulls: 0, oor: 0, typeBad: 0, newestMs: 0 };
      this._runtimes.set(feature, rt);
    }
    const now = atMs ?? this._clock.nowMs();
    const isNull = value === null || value === undefined;
    let typeMismatch = false;
    if (!isNull && expectedType !== undefined) {
      const actual = Array.isArray(value) ? 'object' : typeof value;
      typeMismatch = actual !== expectedType;
    }
    let outOfRange = false;
    if (!isNull && typeof value === 'number') {
      if (rt.exp.min !== undefined && value < rt.exp.min) outOfRange = true;
      if (rt.exp.max !== undefined && value > rt.exp.max) outOfRange = true;
    }
    rt.events.push({ atMs: now, isNull, outOfRange, typeMismatch });
    if (isNull) rt.nulls += 1;
    if (outOfRange) rt.oor += 1;
    if (typeMismatch) rt.typeBad += 1;
    rt.newestMs = Math.max(rt.newestMs, now);
  }

  /** Health report for one feature (sliding window applied). */
  report(feature: string): QualityReport {
    const rt = this._runtimes.get(feature);
    const now = this._clock.nowMs();
    if (!rt) {
      return {
        feature,
        windowMs: this._windowMs,
        writes: 0,
        nullCount: 0,
        outOfRangeCount: 0,
        typeMismatchCount: 0,
        nullRate: 0,
        outOfRangeRate: 0,
        stalenessMs: Number.POSITIVE_INFINITY,
        violations: [],
      };
    }
    this._evict(rt, now - this._windowMs);
    const total = rt.events.length - rt.head;
    const nullRate = total === 0 ? 0 : rt.nulls / total;
    const oorRate = total === 0 ? 0 : rt.oor / total;
    const staleness = rt.newestMs === 0 ? Number.POSITIVE_INFINITY : now - rt.newestMs;

    const violations: QualityViolation[] = [];
    if (rt.exp.maxNullRate !== undefined && nullRate > rt.exp.maxNullRate) {
      violations.push({
        feature,
        kind: 'null-rate',
        observed: nullRate,
        limit: rt.exp.maxNullRate,
        detail: `${rt.nulls}/${total} nulls`,
      });
    }
    if (rt.exp.maxOutOfRangeRate !== undefined && oorRate > rt.exp.maxOutOfRangeRate) {
      violations.push({
        feature,
        kind: 'range-rate',
        observed: oorRate,
        limit: rt.exp.maxOutOfRangeRate,
        detail: `${rt.oor}/${total} out of [${rt.exp.min}, ${rt.exp.max}]`,
      });
    }
    if (rt.exp.maxStalenessMs !== undefined && staleness > rt.exp.maxStalenessMs) {
      violations.push({
        feature,
        kind: 'stale',
        observed: staleness,
        limit: rt.exp.maxStalenessMs,
        detail: `last write ${staleness}ms ago`,
      });
    }
    if (rt.typeBad > 0) {
      violations.push({
        feature,
        kind: 'type-mismatch',
        observed: rt.typeBad,
        limit: 0,
        detail: `${rt.typeBad} writes with wrong type`,
      });
    }
    return {
      feature,
      windowMs: this._windowMs,
      writes: total,
      nullCount: rt.nulls,
      outOfRangeCount: rt.oor,
      typeMismatchCount: rt.typeBad,
      nullRate,
      outOfRangeRate: oorRate,
      stalenessMs: staleness,
      violations,
    };
  }

  /** All violations across declared features — for alerting. */
  violations(): QualityViolation[] {
    const out: QualityViolation[] = [];
    for (const feature of this._runtimes.keys()) {
      out.push(...this.report(feature).violations);
    }
    return out;
  }

  private _evict(rt: Runtime, edge: number): void {
    while (rt.head < rt.events.length && rt.events[rt.head].atMs < edge) {
      const e = rt.events[rt.head];
      if (e.isNull) rt.nulls -= 1;
      if (e.outOfRange) rt.oor -= 1;
      if (e.typeMismatch) rt.typeBad -= 1;
      rt.head += 1;
    }
    if (rt.head > 256 && rt.head * 2 > rt.events.length) {
      rt.events = rt.events.slice(rt.head);
      rt.head = 0;
    }
  }
}
