/**
 * Gradual Rollout Scheduler
 *
 * Automates percentage ramps over time: "start at 5%, +10% every hour
 * until 100%". Unlike the declarative {@link ProgressiveRolloutStrategy}
 * (which evaluates a fixed stage list per request), this scheduler
 * *owns* the schedule state machine — it tracks where each flag's ramp
 * currently stands, computes the effective percentage for "now", and
 * can pause/resume/halt a ramp mid-flight.
 *
 * Ramp model — piecewise-linear schedule:
 *
 *     pct(t) = clamp( startPct + rate·(t − t₀), startPct → targetPct )
 *
 *   linear interpolation between start and target over `durationMs`.
 *   Monotonic by construction — once scheduled, pct never decreases
 *   within a run (sticky-bucket safety: users are never ejected mid-ramp).
 *
 * Guard rails: an optional `errorBudget` hook lets callers halt a ramp
 * when a metric (error rate, p99) breaches a threshold — the scheduler
 * freezes at the current percentage and marks the ramp halted.
 *
 * Complexity: O(1) per query — arithmetic, no iteration over events.
 *
 * @module FeatureFlags/Engine2
 */

export interface IClock2 {
  now(): number;
}

export class SystemClock2 implements IClock2 {
  now(): number {
    return Date.now();
  }
}

export class TestClock2 implements IClock2 {
  private _current: number;
  constructor(start = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
}

export type RampState = 'scheduled' | 'ramping' | 'completed' | 'paused' | 'halted';

export interface RolloutPlan {
  readonly flagKey: string;
  /** Starting percentage (0-100). */
  readonly startPct: number;
  /** Target percentage (0-100). */
  readonly targetPct: number;
  /** Ramp duration — linear from startPct to targetPct. */
  readonly durationMs: number;
  /** Delay before the ramp begins. Default 0. */
  readonly delayMs?: number;
}

export interface RampStatus {
  readonly flagKey: string;
  readonly state: RampState;
  /** Effective percentage right now. */
  readonly currentPct: number;
  /** ms elapsed since ramping began (0 when scheduled). */
  readonly elapsedMs: number;
  /** Why halted, if halted. */
  readonly haltReason: string | null;
}

interface RampRecord {
  plan: RolloutPlan;
  startedAt: number;
  state: RampState;
  /** Percentage frozen at pause/halt time. */
  frozenPct: number | null;
  haltReason: string | null;
}

/** Metric probe — return a 0..1 "badness" score; ≥ threshold halts. */
export type GuardProbe = (flagKey: string) => number;

export class GradualRolloutScheduler {
  private readonly _clock: IClock2;
  private readonly _ramps = new Map<string, RampRecord>();
  private readonly _guards = new Map<string, { probe: GuardProbe; threshold: number }>();

  constructor(clock: IClock2 = new SystemClock2()) {
    this._clock = clock;
  }

  /** Schedule a ramp. One active ramp per flag — rescheduling replaces. */
  schedule(plan: RolloutPlan): void {
    if (plan.startPct < 0 || plan.startPct > 100 || plan.targetPct < 0 || plan.targetPct > 100) {
      throw new RangeError('percentages must be in [0, 100]');
    }
    if (plan.durationMs <= 0) throw new RangeError('durationMs must be positive');
    if (plan.targetPct <= plan.startPct && plan.targetPct !== plan.startPct) {
      // Decreasing ramps are allowed only via explicit rollback — ramps
      // are monotonic so users are never ejected mid-ramp.
      throw new RangeError('targetPct must exceed startPct — use cancel() to roll back');
    }
    this._ramps.set(plan.flagKey, {
      plan,
      startedAt: this._clock.now(),
      state: 'scheduled',
      frozenPct: null,
      haltReason: null,
    });
  }

  /**
   * Effective percentage for a flag right now — updates the ramp's state
   * machine lazily (scheduled → ramping → completed) as a side effect.
   */
  currentPercentage(flagKey: string): number {
    const r = this._ramps.get(flagKey);
    if (!r) return 0;
    this._tick(r);
    return this._pct(r);
  }

  /** Full status snapshot. */
  status(flagKey: string): RampStatus | null {
    const r = this._ramps.get(flagKey);
    if (!r) return null;
    this._tick(r);
    return {
      flagKey,
      state: r.state,
      currentPct: this._pct(r),
      elapsedMs: Math.max(0, this._clock.now() - r.startedAt - (r.plan.delayMs ?? 0)),
      haltReason: r.haltReason,
    };
  }

  /**
   * Attach a guard: `probe` is consulted on every tick; when it returns
   * ≥ threshold the ramp halts at its current percentage. This is the
   * "auto-rollback when error rate spikes" hook.
   */
  addGuard(flagKey: string, probe: GuardProbe, threshold: number): void {
    this._guards.set(flagKey, { probe, threshold });
  }

  /** Freeze a ramp at its current percentage (operator intervention). */
  pause(flagKey: string): void {
    const r = this._ramps.get(flagKey);
    if (r && (r.state === 'ramping' || r.state === 'scheduled')) {
      r.frozenPct = this._pct(r);
      r.state = 'paused';
    }
  }

  /** Resume a paused ramp — shifts startedAt so elapsed time excludes the pause. */
  resume(flagKey: string): void {
    const r = this._ramps.get(flagKey);
    if (r && r.state === 'paused') {
      const pausedPct = r.frozenPct ?? r.plan.startPct;
      // Rewind: pretend the ramp started at whatever time yields pausedPct now.
      const frac = (pausedPct - r.plan.startPct) / Math.max(1e-9, r.plan.targetPct - r.plan.startPct);
      r.startedAt = this._clock.now() - frac * r.plan.durationMs - (r.plan.delayMs ?? 0);
      r.state = 'ramping';
      r.frozenPct = null;
    }
  }

  /** Cancel a ramp entirely — flag returns to 0% (explicit rollback path). */
  cancel(flagKey: string): void {
    this._ramps.delete(flagKey);
  }

  /** All flags with a live ramp. */
  activeRamps(): string[] {
    return [...this._ramps.entries()]
      .filter(([, r]) => r.state !== 'completed' && r.state !== 'halted')
      .map(([k]) => k);
  }

  /* ---------------------------------------------------------------- */

  /** Lazy state transitions + guard evaluation. */
  private _tick(r: RampRecord): void {
    const now = this._clock.now();
    const delay = r.plan.delayMs ?? 0;

    if (r.state === 'scheduled' && now - r.startedAt >= delay) {
      r.state = 'ramping';
    }
    if (r.state === 'ramping') {
      const guard = this._guards.get(r.plan.flagKey);
      if (guard && guard.probe(r.plan.flagKey) >= guard.threshold) {
        r.frozenPct = this._pct(r);
        r.state = 'halted';
        r.haltReason = `guard probe returned ≥ ${guard.threshold}`;
        return;
      }
      if (this._rawPct(r) >= r.plan.targetPct) {
        r.state = 'completed';
      }
    }
  }

  private _rawPct(r: RampRecord): number {
    const now = this._clock.now();
    const delay = r.plan.delayMs ?? 0;
    const elapsed = now - r.startedAt - delay;
    if (elapsed <= 0) return r.plan.startPct;
    const frac = Math.min(1, elapsed / r.plan.durationMs);
    return r.plan.startPct + frac * (r.plan.targetPct - r.plan.startPct);
  }

  private _pct(r: RampRecord): number {
    switch (r.state) {
      case 'paused':
      case 'halted':
        return r.frozenPct ?? r.plan.startPct;
      case 'completed':
        return r.plan.targetPct;
      default:
        return Math.min(r.plan.targetPct, this._rawPct(r));
    }
  }
}
