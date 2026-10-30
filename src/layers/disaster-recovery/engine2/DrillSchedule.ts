/**
 * Drill Scheduling & Cadence
 *
 * A DR programme that drills "sometime" drills never. This registry
 * carries the drill calendar: named drills on fixed cadences, next-due
 * tracking, and overdue reporting — the operational layer that makes
 * the maturity score's "keep drilling" honest.
 *
 * Semantics:
 *   - Each drill has `everyMs` (cadence) and `lastRunAt`.
 *   - `due(now)` lists drills whose next run is at or past due.
 *   - `recordRun` stamps a run and advances the schedule; runs are
 *     anchored to the *scheduled* time, not completion time — a drill
 *     run 2 days late still schedules its next from the cadence grid,
     *     preventing late-runs from silently stretching the cadence.
 *   - `coverage` compares expected runs vs. actual in a window — the
 *     percentage an auditor quotes.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import { DrClock2, SystemDrClock2 } from './types';

export interface DrillEntry {
  readonly name: string;
  /** Cadence in ms. */
  readonly everyMs: number;
  /** Last scheduled-run time (anchor), not completion. */
  lastRunAt: number | null;
  /** Wall-clock the last run finished (for lag reporting). */
  lastCompletedAt?: number;
}

export class DrillSchedule {
  private readonly _clock: DrClock2;
  private readonly _drills = new Map<string, DrillEntry>();

  constructor(clock: DrClock2 = new SystemDrClock2()) {
    this._clock = clock;
  }

  /** Register a drill on a cadence; first run is due at `fromNow` ms. */
  register(name: string, everyMs: number, fromNow = 0): void {
    if (everyMs <= 0) throw new Error('everyMs must be positive');
    if (this._drills.has(name)) throw new Error(`duplicate drill '${name}'`);
    this._drills.set(name, {
      name,
      everyMs,
      lastRunAt: this._clock.now() + fromNow - everyMs,
    });
  }

  /**
   * Next-due time per drill: `lastRunAt + everyMs`. A drill never run
   * is due immediately (registered already-overdue by construction).
   */
  nextDue(name: string): number {
    const d = this._require(name);
    return (d.lastRunAt ?? 0) + d.everyMs;
  }

  /** Drills due at `at` (default now), sorted soonest-overdue first. */
  due(at?: number): DrillEntry[] {
    const t = at ?? this._clock.now();
    return [...this._drills.values()]
      .filter((d) => this.nextDue(d.name) <= t)
      .sort((a, b) => this.nextDue(a.name) - this.nextDue(b.name));
  }

  /**
   * Record a run completing at `completedAt` (default now). The next
   * run is scheduled from the cadence grid: the anchor steps forward
   * in `everyMs` increments until it lands after `completed` — so a
   * 2-days-late quarterly drill does not drift the whole calendar.
   */
  recordRun(name: string, completedAt?: number): void {
    const d = this._require(name);
    const completed = completedAt ?? this._clock.now();
    let anchor = (d.lastRunAt ?? 0) + d.everyMs;
    while (anchor <= completed) anchor += d.everyMs;
    d.lastRunAt = anchor - d.everyMs;
    d.lastCompletedAt = completed;
  }

  /**
   * Cadence coverage over [from, to]: expected runs = window/everyMs
   * (floor); actual = recorded runs inside the window (we only know
   * `lastCompletedAt`, so partial windows are approximated by whether
   * the most recent run landed inside).
   */
  coverage(from: number, to: number): {
    expectedRuns: number;
    completedRuns: number;
    rate: number;
  } {
    let expected = 0;
    let completed = 0;
    for (const d of this._drills.values()) {
      const span = Math.max(0, to - from);
      expected += Math.floor(span / d.everyMs);
      if (d.lastCompletedAt !== undefined && d.lastCompletedAt >= from && d.lastCompletedAt < to) {
        completed++;
      }
    }
    return {
      expectedRuns: expected,
      completedRuns: completed,
      rate: expected === 0 ? 1 : completed / expected,
    };
  }

  /** All registered drills. */
  list(): DrillEntry[] {
    return [...this._drills.values()];
  }

  private _require(name: string): DrillEntry {
    const d = this._drills.get(name);
    if (!d) throw new Error(`unknown drill '${name}'`);
    return d;
  }
}
