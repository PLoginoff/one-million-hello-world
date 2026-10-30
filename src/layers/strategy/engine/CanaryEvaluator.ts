/**
 * CanaryEvaluator — percentage rollout with sticky assignment.
 *
 * A canary release ramps a new code path to 1% → 5% → 25% → 100% of
 * traffic. Two properties matter:
 *
 *   1. Stickiness — once a subject is "in" the canary it must stay in:
 *      a user flipping between old and new behavior mid-session is a
 *      correctness bug. Implemented by hashing `flag:subject` into
 *      [0,1) and comparing against the *current* percentage — raising
 *      the percentage can only add subjects (buckets below the old
 *      cutoff remain in), never evict them.
 *   2. Scheduled ramps — `ramp` walks a flag through a list of
 *      `RampStep`s, each holding a target percentage for `durationMs`;
 *      `evaluate` reads the effective percentage from the schedule on
 *      the injected clock.
 *
 * Guards:
 *   - `pause`/`resume` freeze the ramp clock;
 *   - `rollbackTo(percent)` snaps the effective percentage down
 *     (non-scheduled override) — the emergency lever;
 *   - `finished` when the schedule completes or percent reaches 100.
 *
 * Complexity: evaluate O(#ramp steps) (usually ≤ 10) → effectively O(1).
 *
 * @module StrategyLayer/Engine
 */

import { fnv1a32, StrategyEngineClock, SystemEngineClock } from './types';

export interface RampStep {
  /** Target rollout percentage in [0,100]. */
  percent: number;
  /** Hold this step for (ms) before advancing. */
  durationMs: number;
}

export interface CanaryState {
  flag: string;
  /** Currently effective percentage (includes schedule + override). */
  percent: number;
  /** Index into the schedule; `-1` before ramp start. */
  stepIndex: number;
  paused: boolean;
  finished: boolean;
  /** Manual override percent; `null` = schedule governs. */
  overridePercent: number | null;
}

interface FlagState {
  flag: string;
  schedule: RampStep[];
  stepIndex: number;
  /** Clock time when the current step began. */
  stepStartedAt: number;
  paused: boolean;
  pauseStartedAt: number;
  finished: boolean;
  overridePercent: number | null;
}

export class CanaryEvaluator {
  private readonly _clock: StrategyEngineClock;
  private readonly _flags = new Map<string, FlagState>();

  constructor(clock: StrategyEngineClock = new SystemEngineClock()) {
    this._clock = clock;
  }

  /**
   * Register `flag` with a ramp schedule (or a fixed percentage —
   * `[{percent, durationMs: Infinity}]`). Re-registering resets progress.
   */
  define(flag: string, schedule: readonly RampStep[]): void {
    if (schedule.length === 0) throw new Error(`Canary "${flag}" needs at least one step`);
    for (const s of schedule) {
      if (s.percent < 0 || s.percent > 100) throw new Error(`Canary "${flag}" percent out of range`);
    }
    this._flags.set(flag, {
      flag,
      schedule: schedule.slice(),
      stepIndex: 0,
      stepStartedAt: this._clock.now(),
      paused: false,
      pauseStartedAt: 0,
      finished: false,
      overridePercent: null,
    });
  }

  /** Quick way to register a fixed percentage with no schedule. */
  defineFixed(flag: string, percent: number): void {
    this.define(flag, [{ percent, durationMs: Number.POSITIVE_INFINITY }]);
  }

  /**
   * Should `subjectId` see the canary? Sticky: subject → bucket in
   * [0,100) via hash; `bucket < effectivePercent` decides.
   */
  evaluate(flag: string, subjectId: string): boolean {
    const st = this._flags.get(flag);
    if (!st) return false;
    this._advance(st);
    const percent = this._effectivePercent(st);
    if (percent <= 0) return false;
    if (percent >= 100) return true;
    const bucket = (fnv1a32(`${flag}:${subjectId}`) % 10_000) / 100; // [0,100) with 0.01 granularity
    return bucket < percent;
  }

  /** Advance the schedule to reflect elapsed clock time. */
  private _advance(st: FlagState): void {
    if (st.paused || st.finished) return;
    let now = this._clock.now();
    while (st.stepIndex < st.schedule.length) {
      const step = st.schedule[st.stepIndex];
      if (now - st.stepStartedAt < step.durationMs) break;
      st.stepIndex++;
      st.stepStartedAt = now;
      now = this._clock.now();
    }
    if (st.stepIndex >= st.schedule.length) {
      st.finished = true;
      st.stepIndex = st.schedule.length - 1;
    }
  }

  private _effectivePercent(st: FlagState): number {
    if (st.overridePercent !== null) return st.overridePercent;
    if (st.stepIndex < 0) return 0;
    return st.schedule[st.stepIndex].percent;
  }

  /** Freeze the schedule at the current step (percent keeps governing). */
  pause(flag: string): void {
    const st = this._flags.get(flag);
    if (!st || st.paused) return;
    st.paused = true;
    st.pauseStartedAt = this._clock.now();
  }

  /** Resume a paused schedule — elapsed pause time doesn't count. */
  resume(flag: string): void {
    const st = this._flags.get(flag);
    if (!st || !st.paused) return;
    const pausedFor = this._clock.now() - st.pauseStartedAt;
    st.stepStartedAt += pausedFor;
    st.paused = false;
  }

  /** Force a percentage now, ignoring the schedule until cleared. */
  rollbackTo(flag: string, percent: number): void {
    const st = this._flags.get(flag);
    if (st) st.overridePercent = Math.max(0, Math.min(100, percent));
  }

  /** Clear a manual override and return to the schedule. */
  clearOverride(flag: string): void {
    const st = this._flags.get(flag);
    if (st) st.overridePercent = null;
  }

  state(flag: string): CanaryState | null {
    const st = this._flags.get(flag);
    if (!st) return null;
    this._advance(st);
    return {
      flag: st.flag,
      percent: this._effectivePercent(st),
      stepIndex: st.stepIndex,
      paused: st.paused,
      finished: st.finished,
      overridePercent: st.overridePercent,
    };
  }

  flags(): string[] {
    return Array.from(this._flags.keys());
  }
}
