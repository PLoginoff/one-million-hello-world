/**
 * Recovery Time Estimation
 *
 * The answer to "if we failover *now*, what RTO should we expect?" —
 * predicted from drill history, not a guess. The estimator fits the
 * recent drill outcomes' phases (detect/promote/verify) and projects a
 * P50/P95 estimate for the next failover.
 *
 * Model: per-phase quantiles over the retained drill set — no
 * regression, just order statistics. Drill sets are small enough that
 * a parametric fit would pretend to knowledge we don't have; the
 * quantile is honest. When the set is too small for a p95 (< 10
 * drills) it returns the max — conservative beats precise.
 *
 * The estimate is reported alongside the *drift* — latest drill vs.
 * the median — so "our drills say 45s" is qualified by "but the last
 * one took 70s".
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import { DrillOutcome } from './FailoverDrill';

export interface PhaseEstimate {
  readonly p50: number;
  readonly p95: number;
  readonly samples: number;
}

export interface RecoveryEstimate {
  readonly detect: PhaseEstimate;
  readonly promote: PhaseEstimate;
  readonly verify: PhaseEstimate;
  /** Sum of phase p50s — the central estimate. */
  readonly p50TotalMs: number;
  /** Sum of phase p95s — the conservative bound. */
  readonly p95TotalMs: number;
  /** Latest drill's total vs the p50 — positive = drifting slower. */
  readonly driftMs: number | null;
  readonly drills: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length < 10 && q >= 0.95) return sorted[sorted.length - 1] ?? 0;
  const i = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[i] ?? 0;
}

function phase(sorted: readonly number[]): PhaseEstimate {
  return {
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    samples: sorted.length,
  };
}

export function estimate(outcomes: readonly DrillOutcome[]): RecoveryEstimate {
  const detects = outcomes.map((o) => o.phases.detectMs).sort((a, b) => a - b);
  const promotes = outcomes.map((o) => o.phases.promoteMs).sort((a, b) => a - b);
  const verifies = outcomes.map((o) => o.phases.verifyMs).sort((a, b) => a - b);
  const totals = outcomes.map((o) => o.objective.totalRecoveryMs).sort((a, b) => a - b);

  const detect = phase(detects);
  const promote = phase(promotes);
  const verify = phase(verifies);

  const last = outcomes[outcomes.length - 1];
  const drift =
    last && totals.length > 0
      ? last.objective.totalRecoveryMs - quantile(totals, 0.5)
      : null;

  return {
    detect,
    promote,
    verify,
    p50TotalMs: detect.p50 + promote.p50 + verify.p50,
    p95TotalMs: detect.p95 + promote.p95 + verify.p95,
    driftMs: drift,
    drills: outcomes.length,
  };
}
