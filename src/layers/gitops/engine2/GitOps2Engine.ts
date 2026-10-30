/**
 * GitOps2 Engine — orchestrates the predictive layer.
 *
 * Pipes a full "sync decision" through all four engine2 modules:
 *
 *   1. predict drift for the namespace's resources (DriftPredictor)
 *   2. detect secret rotation vs injection (SecretDriftDetector)
 *   3. decide auto/manual per namespace policy (SyncPolicyEngine)
 *   4. if approved, emit a minimal RollbackPlan for the change
 *
 * The result is a single `SyncAssessment` — everything a control loop
 * (or human approver) needs to green-light or block a sync.
 *
 * @module GitopsLayer/Engine2
 */

import { DesiredRevision, ResourceSpec } from '../engines/types';
import { DriftPredictor } from './DriftPredictor';
import { RollbackPlanner } from './RollbackPlanner';
import { SecretDriftDetector } from './SecretDriftDetector';
import { SyncPolicyEngine } from './SyncPolicyEngine';
import { IClock, SystemClock } from '../engines/types';
import {
  DriftObservation,
  DriftProneness,
  RollbackPlan,
  SecretDrift,
  SyncDecision,
} from './types';

export interface SyncAssessment {
  readonly namespace: string;
  readonly decision: SyncDecision;
  /** Per-resource drift proneness for the pending change's resources. */
  readonly driftProneness: readonly DriftProneness[];
  /** Secret-level drift found in the pending diff. */
  readonly secretDrift: readonly SecretDrift[];
  /** Rollback plan — computed eagerly so approval implies ready-to-revert. */
  readonly rollbackPlan: RollbackPlan;
  readonly assessedAt: number;
}

export class GitOps2Engine {
  private readonly _clock: IClock;
  readonly predictor: DriftPredictor;
  readonly policies: SyncPolicyEngine;
  readonly rollbacker: RollbackPlanner;
  readonly secrets: SecretDriftDetector;

  constructor(
    secrets: SecretDriftDetector,
    clock: IClock = new SystemClock()
  ) {
    this._clock = clock;
    this.predictor = new DriftPredictor({}, clock);
    this.policies = new SyncPolicyEngine([], clock);
    this.rollbacker = new RollbackPlanner();
    this.secrets = secrets;
  }

  /**
   * Full assessment of a pending sync: should it run? what might drift?
   * what would we revert if it went wrong?
   */
  assess(
    namespace: string,
    current: DesiredRevision,
    target: DesiredRevision,
    observedDrifts: readonly DriftObservation[] = []
  ): SyncAssessment {
    const resourceKeys = [...target.resources.keys()];

    // Feed the predictor the latest window so its proneness reflects
    // *this* cycle, not just history.
    this.predictor.observeWindow(resourceKeys, observedDrifts);

    const driftProneness = resourceKeys.map((k) => this.predictor.proneness(k));
    const secretDrift = this.secrets.detect(target);
    const decision = this.policies.decide({
      namespace,
      resourceCount: resourceKeys.length,
      requestedAt: this._clock.now(),
    });
    const rollbackPlan = this.rollbacker.plan(target, current); // revert target→current

    return {
      namespace,
      decision,
      driftProneness,
      secretDrift,
      rollbackPlan,
      assessedAt: this._clock.now(),
    };
  }

  /**
   * Record the outcome of an applied sync — feeds the predictor's
   * baseline so *post-sync* drift rates stay accurate.
   */
  recordSync(namespace: string, resources: readonly string[], drifts: readonly DriftObservation[]): void {
    void namespace;
    this.predictor.observeWindow(resources, drifts);
  }

  /** Whether a namespace's sync has cleared its approval window. */
  mayAutoApply(namespace: string, resourceCount: number, requestedAt: number): boolean {
    return this.policies.windowElapsed({ namespace, resourceCount, requestedAt });
  }
}
