/**
 * Drill Readiness Checklist
 *
 * Pre-flight gate for a failover drill: is it SAFE to drill right now?
 * The questions a real chaos calendar answers — is the replica healthy,
 * is the last drill's follow-up done, is there no live incident — as a
 * checklist whose every item has a reason, not a vibe.
 *
 * Each check is a named predicate with a blocking/non-blocking weight:
 * a failing `blocking` check prevents the drill; a failing advisory
 * check warns in the report but lets it run — matching how runbooks
 * distinguish required and advisory steps.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

export interface ChecklistItem {
  readonly name: string;
  /** true = ready. */
  readonly ok: boolean;
  /** true = blocks the drill when false. */
  readonly blocking: boolean;
  readonly detail?: string;
}

export interface ReadinessReport {
  readonly ready: boolean;
  /** Blocking items that failed — the drill-stoppers. */
  readonly blockers: readonly ChecklistItem[];
  /** Advisory items that failed — proceed-with-caution. */
  readonly warnings: readonly ChecklistItem[];
  readonly items: readonly ChecklistItem[];
}

export function readiness(items: readonly ChecklistItem[]): ReadinessReport {
  const blockers = items.filter((i) => i.blocking && !i.ok);
  const warnings = items.filter((i) => !i.blocking && !i.ok);
  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    items,
  };
}

/**
 * Standard production-drill gates: replica lag under the RPO, a recent
 * consistency pass, no active incident, and a cooldown since the last
 * drill (drills shouldn't stack).
 */
export function standardChecks(input: {
  replicaLagMs: number;
  rpoMs: number;
  lastConsistencyOk: boolean;
  incidentOpen: boolean;
  lastDrillAt: number | null;
  now: number;
  cooldownMs: number;
}): ChecklistItem[] {
  return [
    {
      name: 'replica-lag-within-rpo',
      ok: input.replicaLagMs <= input.rpoMs,
      blocking: true,
      detail: `lag ${input.replicaLagMs}ms vs RPO ${input.rpoMs}ms`,
    },
    {
      name: 'consistency-passed',
      ok: input.lastConsistencyOk,
      blocking: true,
      detail: input.lastConsistencyOk ? 'last consistency check passed' : 'last consistency check failed',
    },
    {
      name: 'no-active-incident',
      ok: !input.incidentOpen,
      blocking: true,
      detail: input.incidentOpen ? 'an incident is open' : 'no active incident',
    },
    {
      name: 'drill-cooldown',
      ok: input.lastDrillAt === null || input.now - input.lastDrillAt >= input.cooldownMs,
      blocking: false,
      detail:
        input.lastDrillAt === null
          ? 'no prior drill'
          : `last drill ${input.now - input.lastDrillAt}ms ago (cooldown ${input.cooldownMs}ms)`,
    },
  ];
}
