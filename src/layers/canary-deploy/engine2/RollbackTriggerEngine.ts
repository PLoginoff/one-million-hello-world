/**
 * Canary Deploy — Automated Rollback Triggers
 *
 * Evaluates a set of {@link RollbackTrigger}s against each incoming
 * {@link CombinedVerdict}. A trigger must fire for `sustainedWindows`
 * consecutive verdicts before it produces a {@link RollbackDecision} —
 * single-window blips never roll back production.
 *
 * State machine per trigger:
 *
 *   idle ──fire──> counting(n) ──fire──> counting(n+1) ──n=sustained──> FIRED
 *                    │                                          │
 *                  pass → idle                              cooldown ──> idle
 *
 * Cooldown: after FIRED, the trigger is suppressed for `cooldownMs` so a
 * flapping metric doesn't spam rollback decisions while the rollout is
 * already unwinding. `reset()` returns everything to idle (new rollout).
 *
 * Built-in trigger factories cover the common cases (any-fail,
 * error-rate absolute ceiling, score floor, sustained degradation);
 * callers may also supply arbitrary predicates.
 *
 * @module CanaryDeploy/Engine2
 */

import {
  CombinedVerdict,
  Engine2Clock,
  RollbackDecision,
  RollbackTrigger,
} from './CanaryEngine2Types';

interface TriggerState {
  consecutive: number;
  firedAt: number | null;
}

export class RollbackTriggerEngine {
  private readonly _triggers: ReadonlyArray<RollbackTrigger>;
  private readonly _clock: Engine2Clock;
  private readonly _states = new Map<string, TriggerState>();
  private readonly _decisions: RollbackDecision[] = [];
  private readonly _verdictHistory: CombinedVerdict[] = [];
  private readonly _maxHistory: number;

  constructor(
    triggers: ReadonlyArray<RollbackTrigger>,
    options: { clock?: Engine2Clock; maxHistory?: number } = {}
  ) {
    if (triggers.length === 0) throw new Error('at least one rollback trigger required');
    const names = new Set<string>();
    for (const t of triggers) {
      if (names.has(t.name)) throw new Error(`duplicate trigger '${t.name}'`);
      names.add(t.name);
      if (t.sustainedWindows < 1) {
        throw new RangeError(`trigger '${t.name}' sustainedWindows must be ≥ 1`);
      }
    }
    this._triggers = triggers;
    this._clock = options.clock ?? Date.now;
    this._maxHistory = options.maxHistory ?? 1_000;
    for (const t of triggers) {
      this._states.set(t.name, { consecutive: 0, firedAt: null });
    }
  }

  get decisions(): ReadonlyArray<RollbackDecision> {
    return this._decisions;
  }

  get verdictHistory(): ReadonlyArray<CombinedVerdict> {
    return this._verdictHistory;
  }

  /** Consecutive-fire count for a trigger (observability/testing). */
  consecutiveCount(triggerName: string): number {
    return this._states.get(triggerName)?.consecutive ?? 0;
  }

  /**
   * Feed one verdict. Returns the rollback decision if a trigger reached
   * its sustained threshold this window, else null.
   *
   * Triggers evaluate independently; the FIRST (declaration order) trigger
   * to reach threshold wins the decision — a deployment only rolls back
   * once. Subsequent triggers keep counting for observability.
   */
  evaluate(verdict: CombinedVerdict): RollbackDecision | null {
    this._verdictHistory.push(verdict);
    if (this._verdictHistory.length > this._maxHistory) {
      this._verdictHistory.splice(0, this._verdictHistory.length - this._maxHistory);
    }

    const now = this._clock();
    for (const trigger of this._triggers) {
      const st = this._states.get(trigger.name)!;
      if (st.firedAt !== null) {
        const cooldown = trigger.cooldownMs ?? Number.POSITIVE_INFINITY;
        if (now - st.firedAt < cooldown) {
          continue; // suppressed during cooldown
        }
        st.firedAt = null;
        st.consecutive = 0;
      }

      const fired = trigger.predicate(verdict);
      if (fired === null) {
        st.consecutive = 0;
        continue;
      }
      st.consecutive++;
      if (st.consecutive >= trigger.sustainedWindows) {
        st.firedAt = now;
        const decision: RollbackDecision = {
          trigger: trigger.name,
          at: now,
          reason: `${trigger.name}: ${fired} (sustained ${st.consecutive} windows)`,
          verdict,
        };
        this._decisions.push(decision);
        return decision;
      }
    }
    return null;
  }

  /** Any trigger currently counting (fired but not yet sustained)? */
  pendingTriggers(): ReadonlyArray<string> {
    const out: string[] = [];
    for (const [name, st] of this._states) {
      if (st.consecutive > 0 && st.firedAt === null) out.push(name);
    }
    return out;
  }

  /** Reset all trigger state (e.g. on a new rollout). */
  reset(): void {
    for (const st of this._states.values()) {
      st.consecutive = 0;
      st.firedAt = null;
    }
    this._decisions.length = 0;
    this._verdictHistory.length = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Built-in trigger factories                                           */
/* ------------------------------------------------------------------ */

export const rollbackTriggers = {
  /**
   * Fires whenever the combined verdict is 'unhealthy' — the bluntest
   * instrument, usually paired with sustainedWindows ≥ 2.
   */
  anyUnhealthy(opts: { sustainedWindows?: number; cooldownMs?: number } = {}): RollbackTrigger {
    return {
      name: 'any-unhealthy',
      sustainedWindows: opts.sustainedWindows ?? 2,
      cooldownMs: opts.cooldownMs,
      severity: 'critical',
      predicate: (v) => (v.status === 'unhealthy' ? v.reason : null),
    };
  },

  /**
   * Fires when a specific metric's error rate exceeds an absolute ceiling,
   * regardless of the live cohort — catches "canary is broken" even when
   * live is also degraded (relative checks would miss that).
   */
  errorRateCeiling(
    metric: string,
    ceiling: number,
    opts: { sustainedWindows?: number; cooldownMs?: number } = {}
  ): RollbackTrigger {
    return {
      name: `error-rate-ceiling:${metric}`,
      sustainedWindows: opts.sustainedWindows ?? 1,
      cooldownMs: opts.cooldownMs,
      severity: 'critical',
      predicate: (v) => {
        const c = v.contributions.find((x) => x.metric === metric);
        if (!c) return null;
        return c.canary.errorRate > ceiling
          ? `${metric} error rate ${c.canary.errorRate.toFixed(3)} > ${ceiling}`
          : null;
      },
    };
  },

  /**
   * Fires when the combined score drops below a floor — a softer signal
   * than any-unhealthy that catches diffuse multi-metric degradation.
   */
  scoreFloor(floor: number, opts: { sustainedWindows?: number; cooldownMs?: number } = {}): RollbackTrigger {
    return {
      name: 'score-floor',
      sustainedWindows: opts.sustainedWindows ?? 3,
      cooldownMs: opts.cooldownMs,
      severity: 'warn',
      predicate: (v) =>
        v.status !== 'insufficient-data' && v.score < floor
          ? `combined score ${v.score.toFixed(3)} < ${floor}`
          : null,
    };
  },

  /**
   * Fires when canary latency percentile exceeds an absolute bound —
   * e.g. p99 must stay under 500ms no matter what live does.
   */
  latencyCeiling(
    metric: string,
    p99CeilingMs: number,
    opts: { sustainedWindows?: number; cooldownMs?: number } = {}
  ): RollbackTrigger {
    return {
      name: `latency-ceiling:${metric}`,
      sustainedWindows: opts.sustainedWindows ?? 2,
      cooldownMs: opts.cooldownMs,
      severity: 'warn',
      predicate: (v) => {
        const c = v.contributions.find((x) => x.metric === metric);
        if (!c) return null;
        return c.canary.p99 > p99CeilingMs
          ? `${metric} canary p99 ${c.canary.p99.toFixed(1)}ms > ${p99CeilingMs}ms`
          : null;
      },
    };
  },
};
