/**
 * GitOps Engine (facade)
 *
 * Ties the pieces together into the standard GitOps loop:
 *
 *   commit desired revision → policy gate → drift detect →
 *   reconcile in waves → health assess → (optionally) rollback
 *
 * Also tracks the "applied revision" pointer (the last revision that
 * fully reconciled + passed health) which is what `rollback` restores —
 * rollback means "roll back to last-known-good", not just "previous
 * commit", matching ArgoCD/Flux operational semantics.
 *
 * @module GitopsLayer/Engines
 */

import {
  DesiredRevision,
  DriftReport,
  GateResult,
  HealthReport,
  IClock,
  ReconcileResult,
  SystemClock,
} from './types';
import { DesiredStateStore } from './DesiredStateStore';
import { DriftDetectionEngine } from './DriftDetectionEngine';
import { ReconciliationEngine } from './ReconciliationEngine';
import { InMemoryLiveStore } from './InMemoryLiveStore';
import { HealthAssessmentEngine } from './HealthAssessmentEngine';
import { PolicyGateEngine } from './PolicyGateEngine';

export interface SyncResult {
  revisionId: string;
  gate: GateResult;
  drift: DriftReport | null;
  reconcile: ReconcileResult | null;
  health: HealthReport[];
  /** Whether this revision became the new last-known-good. */
  promoted: boolean;
}

export class GitOpsEngine {
  readonly store: DesiredStateStore;
  readonly live: InMemoryLiveStore;
  readonly drift: DriftDetectionEngine;
  readonly health: HealthAssessmentEngine;
  readonly gates: PolicyGateEngine;
  private readonly _reconciler: ReconciliationEngine;
  private _lastKnownGood: string | null;

  constructor(clock: IClock = new SystemClock()) {
    this.store = new DesiredStateStore(clock);
    this.live = new InMemoryLiveStore();
    this.drift = new DriftDetectionEngine(this.live);
    this.health = new HealthAssessmentEngine(this.live);
    this.gates = new PolicyGateEngine();
    this._reconciler = new ReconciliationEngine(this.live);
    this._lastKnownGood = null;
  }

  /**
   * Full sync cycle for a committed revision. Short-circuits on gate
   * denial (no drift computed, nothing applied).
   */
  async sync(revisionId: string): Promise<SyncResult> {
    const revision = this.store.get(revisionId);
    if (!revision) throw new Error(`Unknown revision: ${revisionId}`);

    const gate = this.gates.evaluate(revision);
    if (!gate.allowed) {
      return { revisionId, gate, drift: null, reconcile: null, health: [], promoted: false };
    }

    const drift = this.drift.detect(revision);
    const reconcile = this._reconciler.reconcile(revision, drift);
    if (!reconcile.success) {
      return { revisionId, gate, drift, reconcile, health: [], promoted: false };
    }

    const appliedKeys = reconcile.steps
      .filter((s) => s.status === 'applied')
      .map((s) => s.diff.key);
    const health = await this.health.assessAll(appliedKeys);
    const promoted = this.health.allHealthy(health);
    if (promoted) this._lastKnownGood = revisionId;

    return { revisionId, gate, drift, reconcile, health, promoted };
  }

  /**
   * Roll the live state back to the last-known-good revision — the last
   * revision that fully applied AND passed health. Throws when no
   * known-good revision exists.
   */
  async rollback(): Promise<SyncResult> {
    if (this._lastKnownGood === null) {
      throw new Error('No last-known-good revision to roll back to');
    }
    return this.sync(this._lastKnownGood);
  }

  lastKnownGood(): string | null {
    return this._lastKnownGood;
  }
}
