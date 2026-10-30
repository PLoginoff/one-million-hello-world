/**
 * FeatureFlagRouter — composes kill-switch + canary + experiment into
 * a single "should this request take the new path?" decision.
 *
 * A feature flag in production is rarely just on/off: it must respect
 * a kill switch (emergency brake), a canary ramp (gradual rollout), and
 * an A/B experiment (measurement) *simultaneously*. This router chains
 * them in the correct precedence:
 *
 *   request for flag F, subject S
 *     ├── killSwitch.isKilled(F)     → return 'off'   (emergency wins)
 *     ├── experiment gate (running?) → assign variant if covered
 *     └── canary.evaluate(F, S)      → 'on'|'off'     (rollout gate)
 *
 * Order matters: a kill must bypass even a 100% canary; an experiment
 * overrides the canary for covered subjects (they're *in the
 * experiment*, not just the rollout).
 *
 * The router is a thin composition — the three engines remain
 * independently testable and reusable.
 *
 * @module StrategyLayer/Engine
 */

import { AbTestingEngine } from './AbTestingEngine';
import { CanaryEvaluator } from './CanaryEvaluator';
import { ExperimentLifecycle } from './ExperimentLifecycle';
import { KillSwitch } from './KillSwitch';
import { StrategyEngineClock, SystemEngineClock } from './types';

export interface RouteDecision {
  /** Final verdict: which code path. */
  path: 'off' | 'on' | 'experiment';
  /** Why: 'killed' | 'experiment' | 'canary-on' | 'canary-off' | 'unregistered'. */
  reason: string;
  /** Set when path='experiment': the assigned variant. */
  variant?: string;
}

export class FeatureFlagRouter {
  private readonly _kill: KillSwitch;
  private readonly _canary: CanaryEvaluator;
  private readonly _experiments: AbTestingEngine;
  private readonly _lifecycle: ExperimentLifecycle;
  /** flag → experiment id binding. */
  private readonly _flagToExperiment = new Map<string, string>();
  private readonly _clock: StrategyEngineClock;

  constructor(
    deps: {
      killSwitch?: KillSwitch;
      canary?: CanaryEvaluator;
      experiments?: AbTestingEngine;
      lifecycle?: ExperimentLifecycle;
      clock?: StrategyEngineClock;
    } = {},
  ) {
    this._clock = deps.clock ?? new SystemEngineClock();
    this._kill = deps.killSwitch ?? new KillSwitch(this._clock);
    this._canary = deps.canary ?? new CanaryEvaluator(this._clock);
    this._experiments = deps.experiments ?? new AbTestingEngine(this._clock);
    this._lifecycle = deps.lifecycle ?? new ExperimentLifecycle(this._clock);
  }

  /** Wire `flag` to `experimentId` — experiment-covered subjects take the variant path. */
  bindExperiment(flag: string, experimentId: string): void {
    this._flagToExperiment.set(flag, experimentId);
  }

  unbindExperiment(flag: string): boolean {
    return this._flagToExperiment.delete(flag);
  }

  /**
   * Decide the path for `flag`/`subjectId`.
   *
   * - 'off'  : killed, unregistered, or canary-out — serve old path
   * - 'on'   : canary-in — serve new path
   * - 'experiment': covered by an experiment — `variant` says which arm
   */
  decide(flag: string, subjectId: string): RouteDecision {
    if (this._kill.isKilled(flag)) {
      return { path: 'off', reason: 'killed' };
    }

    const expId = this._flagToExperiment.get(flag);
    if (expId !== undefined && this._lifecycle.isRunning(expId)) {
      const variant = this._experiments.assign(expId, subjectId);
      if (variant !== null) {
        return { path: 'experiment', reason: 'experiment', variant };
      }
      // Subject outside experiment coverage falls through to canary.
    }

    const inCanary = this._canary.evaluate(flag, subjectId);
    return { path: inCanary ? 'on' : 'off', reason: inCanary ? 'canary-on' : 'canary-off' };
  }

  /** Accessors so callers can drive the sub-engines directly. */
  get killSwitch(): KillSwitch {
    return this._kill;
  }
  get canary(): CanaryEvaluator {
    return this._canary;
  }
  get experiments(): AbTestingEngine {
    return this._experiments;
  }
  get lifecycle(): ExperimentLifecycle {
    return this._lifecycle;
  }
}
