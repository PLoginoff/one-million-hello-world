/**
 * Blue-Green Deploy — Deployment History Analyzer
 *
 * Learns from past deployments: per-version outcome stats, mean time to
 * detect a bad deploy (MTTD), deploy frequency, and rollback-rate trends.
 * This drives decisions like "is our error budget healthy enough to deploy
 * on Fridays?" — a real guardrail in mature blue-green setups.
 *
 * Statistics are computed on demand over bounded history — deployments are
 * infrequent enough that O(history) queries beat maintaining incremental
 * state.
 *
 * @module BlueGreenDeploy/Deploy
 */

import { BgClock, DeploymentRecord, DeploymentState } from './BlueGreenTypes';

export interface DeploymentStats {
  readonly total: number;
  readonly completed: number;
  readonly rolledBack: number;
  readonly failed: number;
  readonly successRate: number;
  /** Mean ms from deploy start to rollback detection (NaN when no rollbacks). */
  readonly meanDetectionMs: number;
  /** Deploys per day over the observed window. */
  readonly deploysPerDay: number;
  /** Deploys in each day-of-week bucket (0=Sun) — Friday-deploy analysis. */
  readonly byDayOfWeek: ReadonlyArray<number>;
}

export class DeploymentHistory {
  private readonly _clock: BgClock;
  private readonly _records: DeploymentRecord[] = [];
  private readonly _cap: number;

  constructor(clock: BgClock = Date.now, cap = 1000) {
    this._clock = clock;
    this._cap = cap;
  }

  record(r: DeploymentRecord): void {
    this._records.push(r);
    if (this._records.length > this._cap) {
      this._records.splice(0, this._records.length - this._cap);
    }
  }

  get records(): ReadonlyArray<DeploymentRecord> {
    return this._records;
  }

  stats(windowMs?: number): DeploymentStats {
    const cutoff = windowMs === undefined ? 0 : this._clock() - windowMs;
    const inWindow = this._records.filter((r) => r.startedAt >= cutoff);
    const total = inWindow.length;
    const completed = inWindow.filter((r) => r.finalState === DeploymentState.COMPLETE).length;
    const rolledBack = inWindow.filter((r) => r.finalState === DeploymentState.ROLLED_BACK).length;
    const failed = inWindow.filter((r) => r.finalState === DeploymentState.FAILED).length;

    // MTTD: time from start to the ROLLING_BACK transition.
    const detections: number[] = [];
    for (const r of inWindow) {
      const rb = r.transitions.find((t) => t.to === DeploymentState.ROLLING_BACK);
      if (rb) detections.push(rb.at - r.startedAt);
    }
    const meanDetection =
      detections.length === 0 ? Number.NaN : detections.reduce((a, b) => a + b, 0) / detections.length;

    const first = inWindow[0]?.startedAt;
    const last = inWindow[inWindow.length - 1]?.finishedAt;
    const spanDays = first !== undefined && last !== undefined ? Math.max(1 / 24, (last - first) / 86_400_000) : 1;

    const byDay = [0, 0, 0, 0, 0, 0, 0];
    for (const r of inWindow) {
      byDay[new Date(r.startedAt).getUTCDay()]++;
    }

    return {
      total,
      completed,
      rolledBack,
      failed,
      successRate: total > 0 ? completed / total : 1,
      meanDetectionMs: meanDetection,
      deploysPerDay: total / spanDays,
      byDayOfWeek: byDay,
    };
  }

  /** Were any recent deploys risky (rollback/failed within `withinMs`)? */
  recentInstability(withinMs = 86_400_000): boolean {
    const cutoff = this._clock() - withinMs;
    return this._records.some(
      (r) =>
        r.startedAt >= cutoff &&
        (r.finalState === DeploymentState.ROLLED_BACK || r.finalState === DeploymentState.FAILED)
    );
  }
}
