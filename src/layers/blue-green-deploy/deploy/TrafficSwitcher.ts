/**
 * Blue-Green Deploy — Traffic Switcher
 *
 * Routes a fraction of traffic to GREEN vs BLUE and executes both instant
 * (0→100) and gradual (stepped) switches.
 *
 * Gradual switching walks a {@link TrafficStep} plan. Between steps the
 * switcher calls an injected `onStep` hook (used by the orchestrator to run
 * health checks at each dwell) and an injected `sleeper` so dwell time is
 * deterministic under fake clocks.
 *
 * Rollback is O(1): the switcher remembers the split before the last change
 * and can restore it instantly — rollback never walks the plan backwards.
 *
 * @module BlueGreenDeploy/Deploy
 */

import { BgClock, TrafficSplit, TrafficStep } from './BlueGreenTypes';

export class TrafficSwitcher {
  private readonly _clock: BgClock;
  private _split: TrafficSplit = { greenPercent: 0 };
  private _previous: TrafficSplit = { greenPercent: 0 };
  private readonly _appliedLog: Array<{ greenPercent: number; at: number }> = [];

  constructor(clock: BgClock = Date.now) {
    this._clock = clock;
  }

  get split(): TrafficSplit {
    return this._split;
  }

  get appliedLog(): ReadonlyArray<{ greenPercent: number; at: number }> {
    return this._appliedLog;
  }

  /** Route decision for a request — deterministic under injected random. */
  routeToGreen(random: () => number = Math.random): boolean {
    return random() * 100 < this._split.greenPercent;
  }

  /** Instant switch to an absolute split. */
  setSplit(greenPercent: number): void {
    if (!(greenPercent >= 0 && greenPercent <= 100)) {
      throw new RangeError(`greenPercent must be in [0,100], got ${greenPercent}`);
    }
    this._previous = this._split;
    this._split = { greenPercent };
    this._appliedLog.push({ greenPercent, at: this._clock() });
  }

  /** Instant cutover 0→100 (or back). */
  cutover(toGreen: boolean): void {
    this.setSplit(toGreen ? 100 : 0);
  }

  /** Restore the split that was active before the last change — O(1) rollback. */
  rollback(): void {
    const tmp = this._split;
    this._split = this._previous;
    this._previous = tmp;
    this._appliedLog.push({ greenPercent: this._split.greenPercent, at: this._clock() });
  }

  /**
   * Walk a gradual plan. `onStep` runs at each step BEFORE dwelling; throwing
   * from it aborts the shift at the current step (caller decides rollback).
   */
  async shiftGradual(
    plan: ReadonlyArray<TrafficStep>,
    sleeper: (ms: number) => Promise<void>,
    onStep?: (step: TrafficStep, index: number) => Promise<void> | void
  ): Promise<void> {
    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      this.setSplit(step.greenPercent);
      if (onStep) {
        await onStep(step, i);
      }
      if (step.dwellMs > 0 && i < plan.length - 1) {
        await sleeper(step.dwellMs);
      }
    }
  }

  /**
   * Build a standard gradual plan from an array of percentages with uniform
   * dwell — e.g. [10, 50, 100] at 60s dwell.
   */
  static plan(percentages: ReadonlyArray<number>, dwellMs: number): TrafficStep[] {
    return percentages.map((p) => ({ greenPercent: p, dwellMs }));
  }
}
