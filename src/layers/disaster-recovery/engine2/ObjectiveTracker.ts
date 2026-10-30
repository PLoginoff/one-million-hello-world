/**
 * RTO/RPO Measurement
 *
 * Tracks real failover events against declared objectives. Every event
 * is derived from a recorded timeline — `detectedAt`, `promotedAt`,
 * `verifiedAt`, `replicaLagMs` — so the numbers are measurements, not
 * targets restated as results.
 *
 * Definitions used (matching Google's SRE workbook):
 *   - actual RTO = detected→verified is the headline figure for
 *     customer-facing recovery; we also expose detected→promoted (time
 *     to writable) since a long verify tail is a different problem than
 *     a slow promotion.
 *   - actual RPO = replica lag at detection — the bound on lost
 *     acknowledged writes, because anything the replica hadn't applied
 *     at failover is gone.
 *
 * `conformance()` aggregates pass rates and computes the worst-case
 * observed values — the numbers that argue about target changes.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import {
  FailoverEvent,
  ObjectiveResult,
  ObjectiveTargets,
} from './types';

export class ObjectiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObjectiveError';
  }
}

/** Validate a timeline: times must be ordered and non-negative. */
export function measure(event: FailoverEvent, targets: ObjectiveTargets): ObjectiveResult {
  if (event.promotedAt < event.detectedAt) {
    throw new ObjectiveError('promotedAt precedes detectedAt');
  }
  if (event.verifiedAt < event.promotedAt) {
    throw new ObjectiveError('verifiedAt precedes promotedAt');
  }
  if (event.replicaLagMs < 0) {
    throw new ObjectiveError('replicaLagMs is negative');
  }
  if (targets.rtoMs <= 0 || targets.rpoMs < 0) {
    throw new ObjectiveError('invalid targets');
  }
  const actualRtoMs = event.promotedAt - event.detectedAt;
  const totalRecoveryMs = event.verifiedAt - event.detectedAt;
  return {
    event,
    actualRtoMs,
    actualRpoMs: event.replicaLagMs,
    rtoMet: totalRecoveryMs <= targets.rtoMs,
    rpoMet: event.replicaLagMs <= targets.rpoMs,
    totalRecoveryMs,
  };
}

export interface ConformanceReport {
  readonly events: number;
  readonly rtoPassRate: number;
  readonly rpoPassRate: number;
  /** Share meeting both objectives. */
  readonly bothMetRate: number;
  readonly worstRtoMs: number;
  readonly worstRpoMs: number;
  /** Share of events that were drills (readiness posture). */
  readonly drillShare: number;
  readonly realEvents: number;
}

/** Aggregate a set of measured events; empty sets return zeroed rates. */
export function conformance(results: readonly ObjectiveResult[]): ConformanceReport {
  const n = results.length;
  if (n === 0) {
    return {
      events: 0, rtoPassRate: 0, rpoPassRate: 0, bothMetRate: 0,
      worstRtoMs: 0, worstRpoMs: 0, drillShare: 0, realEvents: 0,
    };
  }
  let rto = 0;
  let rpo = 0;
  let both = 0;
  let worstRto = 0;
  let worstRpo = 0;
  let drills = 0;
  let real = 0;
  for (const r of results) {
    if (r.rtoMet) rto++;
    if (r.rpoMet) rpo++;
    if (r.rtoMet && r.rpoMet) both++;
    if (r.totalRecoveryMs > worstRto) worstRto = r.totalRecoveryMs;
    if (r.actualRpoMs > worstRpo) worstRpo = r.actualRpoMs;
    if (r.event.drill) drills++;
    else real++;
  }
  return {
    events: n,
    rtoPassRate: rto / n,
    rpoPassRate: rpo / n,
    bothMetRate: both / n,
    worstRtoMs: worstRto,
    worstRpoMs: worstRpo,
    drillShare: drills / n,
    realEvents: real,
  };
}

/**
 * Trend: split results at `at` (a clock value on detectedAt) and
 * compare bothMetRate before vs. after — is the programme improving?
 */
export function trend(
  results: readonly ObjectiveResult[],
  at: number
): { before: number; after: number; delta: number } {
  const before = results.filter((r) => r.event.detectedAt < at);
  const after = results.filter((r) => r.event.detectedAt >= at);
  const rate = (rs: readonly ObjectiveResult[]): number =>
    rs.length === 0 ? 0 : rs.filter((r) => r.rtoMet && r.rpoMet).length / rs.length;
  const b = rate(before);
  const a = rate(after);
  return { before: b, after: a, delta: a - b };
}
