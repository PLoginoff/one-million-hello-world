/**
 * Secrets Engine2 — Rotation Planning with Grace Windows
 *
 * SecretRotator fires `tick(now)` and rotates what's due. This planner
 * adds the SCHEDULING intelligence on top:
 *
 *   - Per-path rotation POLICIES: interval, grace period, jitter (spread
 *     rotations to avoid a thundering herd at midnight UTC), and a
 *     max-backoff cap when rotations keep failing.
 *   - `plan(horizonMs)` — a forward-looking rotation calendar: "which
 *     secrets rotate this week, and when do their old versions expire?"
 *   - Grace-window overlap detection: warn when `interval < grace` — the
 *     old version never fully expires before the next rotation, which
 *     usually means a misconfigured policy.
 *   - Failure backoff: consecutive rotation failures on a path double
 *     the effective interval up to `maxBackoffMs` — a path that can't
 *     rotate backs off instead of hammering the provider.
 *   - Jitter is deterministic: hash(path) % jitterMs — tests stay stable.
 *
 * Complexity: plan O(paths × rotations-in-horizon); due-set O(paths).
 *
 * @module Secrets/Engine2
 */

import { SecretsClock } from '../vault/SecretTypes';

export interface RotationPolicy {
  readonly path: string;
  /** Nominal rotation interval. */
  readonly intervalMs: number;
  /** How long the superseded version remains readable (default 1h). */
  readonly graceMs?: number;
  /** Max random offset applied per rotation (default 0). */
  readonly jitterMs?: number;
  /** Backoff ceiling after repeated failures (default interval × 8). */
  readonly maxBackoffMs?: number;
}

export interface RotationState {
  readonly path: string;
  /** Nominal next-rotation time before backoff/jitter. */
  scheduledAt: number;
  /** Effective next-rotation time (jitter + backoff applied). */
  dueAt: number;
  readonly graceMs: number;
  consecutiveFailures: number;
  lastRotatedAt: number | null;
}

export interface PlannedRotation {
  readonly path: string;
  readonly rotateAt: number;
  readonly graceEndsAt: number;
}

export interface PolicyWarning {
  readonly path: string;
  readonly warning: 'grace-exceeds-interval' | 'interval-too-short';
  readonly detail: string;
}

export interface RotationPlannerOptions {
  readonly clock?: SecretsClock;
}

export class RotationPlanner {
  private readonly _clock: SecretsClock;
  private readonly _states = new Map<string, RotationState>();

  constructor(options?: RotationPlannerOptions) {
    this._clock = options?.clock ?? (() => Date.now());
  }

  /** Deterministic jitter — hash(path) % jitterMs, stable across runs.
   *  Returned as a NON-NEGATIVE offset in [0, jitterMs). */
  private _jitter(path: string, jitterMs: number): number {
    if (jitterMs <= 0) return 0;
    let h = 0x811c9dc5;
    for (let i = 0; i < path.length; i++) {
      h ^= path.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % jitterMs;
  }

  register(policy: RotationPolicy, startFrom?: number): RotationState {
    const graceMs = policy.graceMs ?? 3_600_000;
    const base = startFrom ?? this._clock();
    const state: RotationState = {
      path: policy.path,
      scheduledAt: base + policy.intervalMs,
      dueAt: base + policy.intervalMs + this._jitter(policy.path, policy.jitterMs ?? 0),
      graceMs,
      consecutiveFailures: 0,
      lastRotatedAt: null,
    };
    this._states.set(policy.path, { ...state });
    // Keep the policy so due() can compute backoffs.
    (this._states.get(policy.path) as RotationState & { _policy?: RotationPolicy })._policy = policy;
    return state;
  }

  /** Paths due for rotation at `now` (default clock). */
  due(now?: number): RotationState[] {
    const t = now ?? this._clock();
    return [...this._states.values()].filter((s) => s.dueAt <= t);
  }

  /**
   * Mark a rotation done. Reschedules: scheduledAt += interval, jitter
   * recomputed, failures reset. Call AFTER the provider put succeeded.
   */
  onRotated(path: string, at?: number): void {
    const s = this._states.get(path);
    if (!s) return;
    const t = at ?? this._clock();
    const policy = (s as RotationState & { _policy?: RotationPolicy })._policy;
    const interval = policy?.intervalMs ?? 0;
    const jitter = policy?.jitterMs ?? 0;
    s.lastRotatedAt = t;
    s.consecutiveFailures = 0;
    s.scheduledAt = t + interval;
    s.dueAt = s.scheduledAt + this._jitter(path, jitter);
  }

  /**
   * A rotation failed: push dueAt out by 2^failures × interval, capped.
   */
  onFailed(path: string): void {
    const s = this._states.get(path);
    if (!s) return;
    const policy = (s as RotationState & { _policy?: RotationPolicy })._policy;
    const interval = policy?.intervalMs ?? 60_000;
    const cap = policy?.maxBackoffMs ?? interval * 8;
    s.consecutiveFailures++;
    const backoff = Math.min(cap, interval * Math.pow(2, s.consecutiveFailures));
    s.dueAt = this._clock() + backoff;
  }

  /**
   * Forward calendar: every planned rotation inside (now, now+horizon].
   * Repeating policies emit one entry per interval — jitter is applied
   * per occurrence so the calendar reflects actual due times.
   */
  plan(horizonMs: number): PlannedRotation[] {
    const now = this._clock();
    const end = now + horizonMs;
    const out: PlannedRotation[] = [];
    for (const s of this._states.values()) {
      const policy = (s as RotationState & { _policy?: RotationPolicy })._policy;
      const interval = policy?.intervalMs ?? 0;
      if (interval <= 0) continue;
      let t = s.dueAt;
      while (t <= end) {
        out.push({ path: s.path, rotateAt: t, graceEndsAt: t + s.graceMs });
        t += interval + this._jitter(s.path, policy?.jitterMs ?? 0);
      }
    }
    return out.sort((a, b) => a.rotateAt - b.rotateAt);
  }

  /**
   * Policy sanity checks. `grace > interval` means old versions never
   * fully lapse before the next rotation — usually an accident.
   * `interval < 1 minute` is almost certainly a typo.
   */
  warnings(): PolicyWarning[] {
    const out: PolicyWarning[] = [];
    for (const s of this._states.values()) {
      const policy = (s as RotationState & { _policy?: RotationPolicy })._policy;
      if (!policy) continue;
      if (s.graceMs > policy.intervalMs) {
        out.push({
          path: s.path,
          warning: 'grace-exceeds-interval',
          detail: `grace ${s.graceMs}ms > interval ${policy.intervalMs}ms — superseded versions never expire`,
        });
      }
      if (policy.intervalMs < 60_000) {
        out.push({
          path: s.path,
          warning: 'interval-too-short',
          detail: `interval ${policy.intervalMs}ms < 60s — likely a misconfiguration`,
        });
      }
    }
    return out;
  }

  state(path: string): RotationState | undefined {
    return this._states.get(path);
  }
}
