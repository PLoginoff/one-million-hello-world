/**
 * CohortRetention — classic signup-cohort retention matrix.
 *
 * Users are bucketed into cohorts by the period containing their
 * *first observed* event (the engine's stand-in for signup time —
 * pass an explicit `signup` event first if the product defines
 * registration separately). Each user is then "retained in period p"
 * if they produced at least one activity event inside
 * `[cohortStart + p·periodMs, cohortStart + (p+1)·periodMs)`.
 *
 * Output is the triangle familiar from Mixpanel/Amplitude:
 *
 *   cohort      size   p0     p1     p2     p3
 *   2026-W01    120    100%   42%    31%    28%
 *   2026-W02    98     100%   45%    33%
 *
 * Rows are truncated where the clock hasn't reached the period —
 * no speculative zeros for the future.
 *
 * Implementation: per user we keep the cohort index plus a bitset of
 * active period offsets (a Set<number> — sparse is fine; retention
 * horizons are tens of periods, not thousands). Report is
 * O(users × active periods).
 *
 * @module AnalyticsLayer/Engine
 */

import {
  AnalyticsClock,
  AnalyticsEvent,
  CohortOptions,
  CohortReport,
  CohortRow,
  RetentionCell,
  SystemAnalyticsClock,
} from './types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class CohortRetention {
  private readonly _periodMs: number;
  private readonly _periods: number;
  private readonly _activity: ReadonlySet<string> | null;
  private readonly _clock: AnalyticsClock;

  /**
   * userId → { cohortIndex, activePeriods }. cohortIndex is the
   * integer index of the signup period relative to `epochOriginMs`.
   */
  private readonly _users: Map<
    string,
    { cohortIndex: number; activePeriods: Set<number> }
  >;
  /** cohortIndex → member count (redundant but O(1) at report time). */
  private readonly _cohortSizes: Map<number, number>;
  /** Everything is measured relative to the first observed period. */
  private _epochOriginMs: number | null;

  constructor(options: CohortOptions = {}, clock?: AnalyticsClock) {
    this._periodMs = options.periodMs ?? WEEK_MS;
    if (this._periodMs <= 0) throw new RangeError('periodMs must be > 0');
    this._periods = options.periods ?? 12;
    this._activity =
      options.activityEvents !== undefined && options.activityEvents.length > 0
        ? new Set(options.activityEvents)
        : null;
    this._clock = clock ?? new SystemAnalyticsClock();
    this._users = new Map();
    this._cohortSizes = new Map();
    this._epochOriginMs = null;
  }

  /**
   * Ingest one event. The first event for a user fixes their cohort;
   * every event marks its containing period active *provided it falls
   * in or after the user's cohort period* — events before signup
   * (clock skew, backfill) can't make a user "retained" before they
   * existed and are ignored for retention (but still count toward
   * cohort membership if they arrived first).
   */
  addEvent(event: AnalyticsEvent): void {
    const userId = event.userId;
    if (userId === undefined) return;
    if (this._activity !== null && !this._activity.has(event.name)) return;

    if (this._epochOriginMs === null) {
      this._epochOriginMs = this._bucketStart(event.timestamp);
    }

    let rec = this._users.get(userId);
    const periodIndex = Math.floor(
      (event.timestamp - this._epochOriginMs) / this._periodMs
    );

    if (rec === undefined) {
      rec = { cohortIndex: Math.max(0, periodIndex), activePeriods: new Set() };
      this._users.set(userId, rec);
      this._cohortSizes.set(
        rec.cohortIndex,
        (this._cohortSizes.get(rec.cohortIndex) ?? 0) + 1
      );
    }
    const offset = periodIndex - rec.cohortIndex;
    if (offset >= 0) rec.activePeriods.add(offset);
  }

  addEvents(events: readonly AnalyticsEvent[]): void {
    for (const e of events) this.addEvent(e);
  }

  /**
   * Compute the retention matrix. Only periods whose start is ≤ now
   * are reported — a cohort two weeks old simply has fewer cells.
   */
  report(): CohortReport {
    const now = this._clock.now();
    const rows: CohortRow[] = [];
    if (this._epochOriginMs === null) {
      return { periodMs: this._periodMs, rows };
    }

    const cohortIndices = [...this._cohortSizes.keys()].sort((a, b) => a - b);
    for (const ci of cohortIndices) {
      const cohortStart = this._epochOriginMs + ci * this._periodMs;
      const size = this._cohortSizes.get(ci) ?? 0;
      const cells: RetentionCell[] = [];

      // Period 0 is definitionally 100% for every member.
      for (let p = 0; p <= this._periods; p++) {
        const periodStart = cohortStart + p * this._periodMs;
        if (periodStart > now) break; // the future isn't data
        let active = 0;
        if (p === 0) {
          active = size;
        } else {
          for (const rec of this._users.values()) {
            if (rec.cohortIndex === ci && rec.activePeriods.has(p)) active++;
          }
        }
        cells.push({ period: p, active, retained: active / size });
      }
      rows.push({ cohortStart, cohortSize: size, cells });
    }
    return { periodMs: this._periodMs, rows };
  }

  /** Retained fraction for one cohort/period cell, or undefined. */
  retentionAt(cohortStart: number, period: number): number | undefined {
    const row = this.report().rows.find((r) => r.cohortStart === cohortStart);
    return row?.cells.find((c) => c.period === period)?.retained;
  }

  /** Number of tracked users. */
  get userCount(): number {
    return this._users.size;
  }

  /** Number of non-empty cohorts. */
  get cohortCount(): number {
    return this._cohortSizes.size;
  }

  /** First ms of the period containing `t`. */
  private _bucketStart(t: number): number {
    return Math.floor(t / this._periodMs) * this._periodMs;
  }
}
