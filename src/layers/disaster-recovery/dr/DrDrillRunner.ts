/**
 * Disaster Recovery — DR Drill Runner
 *
 * Runs an end-to-end recovery drill against a service and produces a weighted
 * score. A drill exercises the real DR machinery (failover machine, backup
 * verifier, lag monitor, RTO/RPO tracker) rather than a parallel simulation —
 * the point is to surface broken assumptions before a real disaster does.
 *
 * Scored steps (weights):
 *   1. backup-verified      (25%) — newest backup restores + checksum passes
 *   2. replica-within-rpo   (15%) — promotion candidate lag inside RPO budget
 *   3. failover-executed    (30%) — quorum + promote + repoint + verify
 *   4. rto-met              (20%) — measured failover time ≤ RTO target
 *   5. corruption-scan-clean(10%) — scrub of restored data finds no corruption
 *
 * Score = Σ(weight × pass). A drill "passes" at ≥ 0.8 (configurable).
 *
 * @module DisasterRecovery/DR
 */

import {
  BackupArtifact,
  DrClock,
  DrNode,
  DrillReport,
  DrillStepResult,
  RecoveryObjective,
} from './DrTypes';
import { FailoverHooks, FailoverStateMachine } from './FailoverStateMachine';
import { BackupVerifier } from './BackupVerifier';
import { CorruptionDetector, DataSegment } from './CorruptionDetector';
import { RtoRpoTracker } from './RtoRpoTracker';
import { ReplicationLagMonitor } from './ReplicationLagMonitor';

export interface DrillPlan {
  readonly drillId: string;
  readonly objective: RecoveryObjective;
  /** Newest backup artifact id for the service. */
  readonly backupId: string;
  /** Candidate standby + full voter set for the failover step. */
  readonly candidate: DrNode;
  readonly voters: ReadonlyArray<DrNode>;
  /** Hooks the failover machine drives during the drill. */
  readonly failoverHooks: FailoverHooks;
  /** Segments representing the restored dataset for the corruption scrub. */
  readonly restoredSegments: ReadonlyArray<DataSegment>;
  /** Score threshold to consider the drill passed (default 0.8). */
  readonly passThreshold?: number;
}

const STEP_WEIGHTS = {
  backupVerified: 0.25,
  replicaWithinRpo: 0.15,
  failoverExecuted: 0.3,
  rtoMet: 0.2,
  corruptionScanClean: 0.1,
} as const;

export class DrDrillRunner {
  private readonly _clock: DrClock;
  private readonly _verifier: BackupVerifier;
  private readonly _tracker: RtoRpoTracker;
  private readonly _lag: ReplicationLagMonitor;
  private readonly _corruption: CorruptionDetector;

  constructor(
    verifier: BackupVerifier,
    tracker: RtoRpoTracker,
    lag: ReplicationLagMonitor,
    corruption: CorruptionDetector,
    clock: DrClock = Date.now
  ) {
    this._verifier = verifier;
    this._tracker = tracker;
    this._lag = lag;
    this._corruption = corruption;
    this._clock = clock;
  }

  /**
   * Execute the drill. Each step is timed individually; failures short-circuit
   * dependent steps (a failed failover makes RTO measurement moot) but the
   * report always contains every step for a complete audit trail.
   */
  async run(plan: DrillPlan): Promise<DrillReport> {
    const startedAt = this._clock();
    const steps: DrillStepResult[] = [];
    const time = <T>(step: string, detail: string, fn: () => Promise<T> | T): Promise<{ ok: boolean; value?: T; detail: string }> =>
      (async () => {
        const t0 = this._clock();
        try {
          const value = await fn();
          steps.push({ step, passed: true, durationMs: this._clock() - t0, detail });
          return { ok: true, value, detail };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          steps.push({ step, passed: false, durationMs: this._clock() - t0, detail: `${detail}: ${msg}` });
          return { ok: false, detail: msg };
        }
      })();

    // Ensure objective registered (idempotent for repeated drills).
    this._tracker.registerObjective(plan.objective);

    // Step 1 — backup verification.
    const backup = await time('backup-verified', `verify ${plan.backupId}`, async () => {
      const r = await this._verifier.verify(plan.backupId);
      if (!r.verified) throw new Error(r.error ?? 'backup verification failed');
      return r;
    });

    // Step 2 — replica lag within RPO.
    const lagOk = await time('replica-within-rpo', `lag of ${plan.candidate.nodeId}`, async () => {
      const primary = plan.voters.find((v) => v.nodeId !== plan.candidate.nodeId && v.position >= plan.candidate.position);
      if (!primary) throw new Error('no primary reference in voter set');
      const reading = this._lag.observe(primary, plan.candidate);
      if (!reading.withinRpo) {
        throw new Error(`lag ${reading.timeLagMs.toFixed(0)}ms > rpo ${plan.objective.rpoMs}ms`);
      }
      return reading;
    });

    // Step 3 — failover execution (also starts the RTO clock).
    this._tracker.declareDisaster(plan.objective.serviceId);
    const fsm = new FailoverStateMachine(
      plan.voters[0].nodeId,
      plan.failoverHooks,
      this._clock
    );
    let failoverOk = false;
    let newPrimary: string | undefined;
    await time('failover-executed', `promote ${plan.candidate.nodeId}`, async () => {
      fsm.degrade('drill: simulated primary loss');
      const result = await fsm.failover(plan.candidate, plan.voters);
      if (result.finalState !== 'FAILED_OVER' && !result.newPrimaryId) {
        throw new Error(result.abortReason ?? 'failover aborted');
      }
      failoverOk = true;
      newPrimary = result.newPrimaryId;
      return result;
    });
    void failoverOk;
    const rtoMeasurement = this._tracker.markRestored(plan.objective.serviceId);
    const rtoMs = rtoMeasurement?.measuredMs ?? Number.POSITIVE_INFINITY;
    const rtoMet = rtoMeasurement?.status === 'MET';

    // Step 4 — RTO assessment (only meaningful if failover ran).
    if (newPrimary !== undefined) {
      steps.push({
        step: 'rto-met',
        passed: rtoMet,
        durationMs: 0,
        detail: `rto ${rtoMs}ms vs target ${plan.objective.rtoMs}ms`,
      });
    } else {
      steps.push({ step: 'rto-met', passed: false, durationMs: 0, detail: 'failover did not complete' });
    }

    // Step 5 — corruption scrub of the restored dataset.
    await time('corruption-scan-clean', `scrub ${plan.restoredSegments.length} segments`, async () => {
      const report = this._corruption.scan(plan.restoredSegments);
      if (report.corrupt > 0) {
        const ids = report.findings.filter((f) => f.corrupt).map((f) => f.segmentId);
        throw new Error(`corrupt segments: ${ids.join(', ')}`);
      }
      if (report.unverified > 0) {
        throw new Error(`${report.unverified} segments not in manifest`);
      }
      return report;
    });

    // Score.
    const weightFor = (step: string): number => {
      switch (step) {
        case 'backup-verified': return STEP_WEIGHTS.backupVerified;
        case 'replica-within-rpo': return STEP_WEIGHTS.replicaWithinRpo;
        case 'failover-executed': return STEP_WEIGHTS.failoverExecuted;
        case 'rto-met': return STEP_WEIGHTS.rtoMet;
        case 'corruption-scan-clean': return STEP_WEIGHTS.corruptionScanClean;
        default: return 0;
      }
    };
    const score = steps.reduce((acc, s) => acc + (s.passed ? weightFor(s.step) : 0), 0);

    void backup;
    void lagOk;

    const finishedAt = this._clock();
    return {
      drillId: plan.drillId,
      serviceId: plan.objective.serviceId,
      steps,
      score,
      rtoMeasuredMs: rtoMs,
      rpoMeasuredMs: Number.NaN,
      rtoMet,
      rpoMet: steps.find((s) => s.step === 'replica-within-rpo')?.passed ?? false,
      startedAt,
      finishedAt,
    };
  }
}

export { STEP_WEIGHTS as DR_DRILL_STEP_WEIGHTS };
