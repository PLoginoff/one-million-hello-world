/**
 * Chaos Engineering — Resilience Scorer
 *
 * Aggregates experiment outcomes into a resilience score per target/system,
 * the same idea as Chaos Toolkit's "resilience score" and Gremlin's
 * reliability score: how well does the system hold steady state under
 * increasing fault pressure?
 *
 * Model
 * -----
 * Each recorded experiment contributes to a per-target score:
 *   - hypothesis held        → +1.0 × severityWeight
 *   - hypothesis violated    → +0.4 × severityWeight (partial: detected & survived)
 *   - aborted by abort-cond  → +0.0 × severityWeight (guardrails worked, but
 *                              steady state did NOT hold)
 *   - failed/errored         → +0.2 × severityWeight (inconclusive, small credit)
 *
 * severityWeight scales with FaultSeverity (LOW=0.5 … CRITICAL=2.0): surviving
 * a critical fault counts more than surviving a low one.
 *
 * The target score is `earned / possible` — a target that's only been probed
 * lightly scores less confidently than one hammered by critical faults, so
 * `coverage` (fraction of registered faults ever exercised) is reported
 * alongside the raw score.
 *
 * @module ChaosEngineering/Engine
 */

import { ExperimentReport, ExperimentState, FaultSeverity } from './ChaosEngineTypes';

export interface ResilienceEntry {
  readonly faultSeverity: FaultSeverity;
  readonly targetId: string;
  readonly report: ExperimentReport;
}

export interface TargetScore {
  readonly targetId: string;
  /** earned/possible ∈ [0,1] — NaN reported as 0 when no experiments ran. */
  readonly score: number;
  /** Fraction of distinct fault severities exercised (coverage proxy). */
  readonly severityCoverage: number;
  readonly experiments: number;
  readonly breakdown: Readonly<{ held: number; violated: number; aborted: number; failed: number }>;
}

const SEVERITY_WEIGHT: Readonly<Record<FaultSeverity, number>> = {
  [FaultSeverity.LOW]: 0.5,
  [FaultSeverity.MEDIUM]: 1,
  [FaultSeverity.HIGH]: 1.5,
  [FaultSeverity.CRITICAL]: 2,
};

const OUTCOME_CREDIT = {
  held: 1,
  violated: 0.4,
  aborted: 0,
  failed: 0.2,
} as const;

export class ResilienceScorer {
  private readonly _entries = new Map<string, ResilienceEntry[]>();
  private readonly _severitiesSeen = new Map<string, Set<FaultSeverity>>();

  /** Record an experiment outcome against a target. */
  record(entry: ResilienceEntry): void {
    let list = this._entries.get(entry.targetId);
    if (!list) {
      list = [];
      this._entries.set(entry.targetId, list);
    }
    list.push(entry);
    let sev = this._severitiesSeen.get(entry.targetId);
    if (!sev) {
      sev = new Set();
      this._severitiesSeen.set(entry.targetId, sev);
    }
    sev.add(entry.faultSeverity);
  }

  /** Score one target. */
  score(targetId: string): TargetScore {
    const entries = this._entries.get(targetId) ?? [];
    let earned = 0;
    let possible = 0;
    const breakdown = { held: 0, violated: 0, aborted: 0, failed: 0 };
    for (const e of entries) {
      const w = SEVERITY_WEIGHT[e.faultSeverity];
      possible += w;
      const outcome = this._classify(e.report);
      breakdown[outcome]++;
      earned += w * OUTCOME_CREDIT[outcome];
    }
    return {
      targetId,
      score: possible > 0 ? earned / possible : 0,
      severityCoverage: (this._severitiesSeen.get(targetId)?.size ?? 0) / 4,
      experiments: entries.length,
      breakdown,
    };
  }

  /** Scores for every tracked target, sorted ascending (worst first). */
  scoreAll(): ReadonlyArray<TargetScore> {
    const out: TargetScore[] = [];
    for (const id of this._entries.keys()) out.push(this.score(id));
    out.sort((a, b) => a.score - b.score);
    return out;
  }

  /** Weakest targets below `threshold` — candidates for hardening work. */
  weakest(threshold = 0.7): ReadonlyArray<TargetScore> {
    return this.scoreAll().filter((s) => s.score < threshold);
  }

  private _classify(r: ExperimentReport): keyof typeof OUTCOME_CREDIT {
    switch (r.finalState) {
      case ExperimentState.COMPLETED:
        return r.hypothesisHeld ? 'held' : 'violated';
      case ExperimentState.ABORTED:
        return 'aborted';
      case ExperimentState.FAILED:
      default:
        return 'failed';
    }
  }
}
