/**
 * Automated Failover Drill
 *
 * Runs a scripted failover — detect → promote → verify — against an
 * injected environment and scores the result. The point of a drill is
 * not the pass/fail; it's producing a *measured* `FailoverEvent` plus
 * a score that an auditor can trace back to evidence.
 *
 * The drill environment is a thin interface (detect, promote, verify,
 * readReplicaLag) — real implementations wrap the actual cluster API,
 * test implementations are a few lines. The clock supplies every
 * timestamp: the drill *measures* the environment's latency by reading
 * the clock before/after each phase, so a test that advances the clock
 * inside `promote` records a real promotion duration.
 *
 * Scoring (0–100):
 *   - RTO component: totalRecovery vs target, scaled — at/under target
 *     scores 50, over target decays linearly to 0 at 2× target.
 *   - RPO component: same shape against replicaLag target.
 *   - Bonus/penalty: each completed runbook checkpoint step adds 2 up
 *     to 10; a halted runbook subtracts 15. Drills that measure but
 *     don't exercise the runbook score lower.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import {
  DrClock2,
  FailoverEvent,
  ObjectiveResult,
  ObjectiveTargets,
  SystemDrClock2,
} from './types';
import { measure } from './ObjectiveTracker';
import { Runbook } from './Runbook';
import { RunbookResult } from './types';

/** What the drill drives; a real impl wraps the cluster control plane. */
export interface DrillEnvironment {
  /** Confirm the primary is actually down; ms to detection is measured. */
  detect(): Promise<void> | void;
  /** Promote the replica to writable. */
  promote(): Promise<void> | void;
  /** Confirm traffic/readiness on the new primary. */
  verify(): Promise<void> | void;
  /** Replica lag at the moment of detection. */
  replicaLag(): Promise<number> | number;
}

export interface DrillOutcome {
  readonly event: FailoverEvent;
  readonly objective: ObjectiveResult;
  readonly score: number;
  readonly runbook?: RunbookResult;
  readonly phases: {
    readonly detectMs: number;
    readonly promoteMs: number;
    readonly verifyMs: number;
  };
}

export class DrillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrillError';
  }
}

export class FailoverDrill {
  private readonly _clock: DrClock2;
  private readonly _targets: ObjectiveTargets;
  private readonly _env: DrillEnvironment;
  private readonly _runbook?: Runbook;

  constructor(
    env: DrillEnvironment,
    targets: ObjectiveTargets,
    clock: DrClock2 = new SystemDrClock2(),
    runbook?: Runbook
  ) {
    this._env = env;
    this._targets = targets;
    this._clock = clock;
    this._runbook = runbook;
  }

  /**
   * Execute the drill. The detected→promoted→verified timeline is
   * read off the clock around each phase — phases that take time in a
   * real environment produce real durations.
   */
  async run(): Promise<DrillOutcome> {
    const detectedAt = this._clock.now();
    const lag = await this._env.replicaLag();
    await this._env.detect();
    const afterDetect = this._clock.now();
    await this._env.promote();
    const promotedAt = this._clock.now();
    await this._env.verify();
    const verifiedAt = this._clock.now();

    const event: FailoverEvent = {
      detectedAt,
      promotedAt,
      verifiedAt,
      replicaLagMs: lag,
      drill: true,
    };
    const objective = measure(event, this._targets);

    let runbook: RunbookResult | undefined;
    if (this._runbook) {
      runbook = await this._runbook.run();
    }
    const score = this._score(objective, runbook);
    return {
      event,
      objective,
      score,
      runbook,
      phases: {
        detectMs: afterDetect - detectedAt,
        promoteMs: promotedAt - afterDetect,
        verifyMs: verifiedAt - promotedAt,
      },
    };
  }

  private _score(o: ObjectiveResult, rb: RunbookResult | undefined): number {
    const linear = (actual: number, target: number): number => {
      if (target <= 0) return actual === 0 ? 1 : 0;
      const x = actual / target;
      if (x <= 1) return 1;
      if (x >= 2) return 0;
      return 2 - x; // linear decay 1→0 over [target, 2·target]
    };
    const rto = linear(o.totalRecoveryMs, this._targets.rtoMs) * 50;
    const rpo = linear(o.actualRpoMs, this._targets.rpoMs) * 50;
    let bonus = 0;
    if (rb) {
      bonus += Math.min(10, rb.checkpoints.length * 2);
      if (rb.halted) bonus -= 15;
    }
    const raw = rto + rpo + bonus;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
}
