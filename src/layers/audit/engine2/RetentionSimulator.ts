/**
 * Retention Policy Simulator
 *
 * Dry-run what a retention policy *would* do against the current store —
 * without touching it. Produces a per-record plan (keep / promote /
 * hold / purge) plus aggregate projections: bytes freed, records lost
 * per tier, and the holds that block purges.
 *
 * Also supports "what-if" comparisons: evaluate a candidate policy side
 * by side with the active one to preview impact before rollout.
 *
 * @module AuditLayer/Engine2
 */

import type {
  AuditRecord,
  LegalHold,
  RetentionPolicy,
  RetentionTierName,
} from '../engine/types';
import type { AuditStore } from '../engine/AuditStore';
import { holdMatches } from '../engine/RetentionManager';

export type PlannedAction = 'keep' | 'promote' | 'purge' | 'hold';

export interface RecordPlan {
  readonly recordId: string;
  readonly seq: number;
  readonly currentTier: RetentionTierName;
  readonly action: PlannedAction;
  /** Target tier for 'promote', undefined otherwise. */
  readonly targetTier?: RetentionTierName;
  /** Id of the legal hold blocking purge, when action === 'hold'. */
  readonly holdId?: string;
  readonly ageMs: number;
}

export interface TierProjection {
  readonly tier: RetentionTierName;
  readonly records: number;
  readonly bytes: number;
  readonly purging: number;
  readonly promoting: number;
}

export interface SimulationReport {
  readonly evaluatedAt: number;
  readonly policy: RetentionPolicy;
  readonly plans: readonly RecordPlan[];
  readonly byTier: readonly TierProjection[];
  readonly totalRecords: number;
  readonly wouldPurge: number;
  readonly wouldPromote: number;
  readonly wouldHold: number;
  /** Estimated serialized bytes reclaimed by purges. */
  readonly bytesFreed: number;
  /** Holds that were actually exercised. */
  readonly activeHolds: readonly string[];
}

export interface PolicyComparison {
  readonly current: SimulationReport;
  readonly candidate: SimulationReport;
  /** Purge count delta (candidate − current). Positive = more aggressive. */
  readonly purgeDelta: number;
  readonly bytesFreedDelta: number;
  /** Records the candidate would purge that the current keeps. */
  readonly newlyPurged: readonly string[];
}

export class RetentionSimulator {
  /**
   * Evaluate `policy` against `records` at `nowMs`, honouring `holds`.
   * Pure function — no store mutation.
   */
  simulate(
    records: readonly AuditRecord[],
    policy: RetentionPolicy,
    holds: readonly LegalHold[],
    nowMs: number
  ): SimulationReport {
    const plans: RecordPlan[] = [];
    const tierAcc = new Map<RetentionTierName, { records: number; bytes: number; purging: number; promoting: number }>();
    const activeHolds = new Set<string>();
    let bytesFreed = 0;

    for (const r of records) {
      const ageMs = nowMs - r.timestamp;
      const bytes = JSON.stringify(r).length;
      const plan = this.planRecord(r, policy, holds, ageMs);
      plans.push(plan);
      if (plan.holdId) activeHolds.add(plan.holdId);
      if (plan.action === 'purge') bytesFreed += bytes;

      const acc = tierAcc.get(r.tier) ?? { records: 0, bytes: 0, purging: 0, promoting: 0 };
      acc.records++;
      acc.bytes += bytes;
      if (plan.action === 'purge') acc.purging++;
      if (plan.action === 'promote') acc.promoting++;
      tierAcc.set(r.tier, acc);
    }

    const byTier: TierProjection[] = [...tierAcc.entries()].map(([tier, a]) => ({
      tier,
      records: a.records,
      bytes: a.bytes,
      purging: a.purging,
      promoting: a.promoting,
    }));

    return {
      evaluatedAt: nowMs,
      policy,
      plans,
      byTier,
      totalRecords: records.length,
      wouldPurge: plans.filter((p) => p.action === 'purge').length,
      wouldPromote: plans.filter((p) => p.action === 'promote').length,
      wouldHold: plans.filter((p) => p.action === 'hold').length,
      bytesFreed,
      activeHolds: [...activeHolds],
    };
  }

  /** Pull records from a store then simulate — convenience wrapper. */
  simulateStore(
    store: AuditStore,
    policy: RetentionPolicy,
    holds: readonly LegalHold[],
    nowMs: number
  ): SimulationReport {
    const records = store.query({ limit: 1_000_000 }).records;
    return this.simulate(records, policy, holds, nowMs);
  }

  /**
   * Side-by-side comparison of a candidate policy vs. the current one.
   * Use before tightening retention — answers "what would we lose?"
   */
  compare(
    records: readonly AuditRecord[],
    current: RetentionPolicy,
    candidate: RetentionPolicy,
    holds: readonly LegalHold[],
    nowMs: number
  ): PolicyComparison {
    const cur = this.simulate(records, current, holds, nowMs);
    const cand = this.simulate(records, candidate, holds, nowMs);
    const curPurged = new Set(
      cur.plans.filter((p) => p.action === 'purge').map((p) => p.recordId)
    );
    const newlyPurged = cand.plans
      .filter((p) => p.action === 'purge' && !curPurged.has(p.recordId))
      .map((p) => p.recordId);
    return {
      current: cur,
      candidate: cand,
      purgeDelta: cand.wouldPurge - cur.wouldPurge,
      bytesFreedDelta: cand.bytesFreed - cur.bytesFreed,
      newlyPurged,
    };
  }

  private planRecord(
    r: AuditRecord,
    policy: RetentionPolicy,
    holds: readonly LegalHold[],
    ageMs: number
  ): RecordPlan {
    // Legal hold beats everything, including purge.
    const hold = holds.find((h) => holdMatches(h, r));
    if (hold) {
      return {
        recordId: r.id,
        seq: r.seq,
        currentTier: r.tier,
        action: 'hold',
        holdId: hold.id,
        ageMs,
      };
    }
    if (ageMs >= policy.purgeAfterMs) {
      return { recordId: r.id, seq: r.seq, currentTier: r.tier, action: 'purge', ageMs };
    }
    // Find the record's tier definition; if it aged out of its tier and
    // a next tier exists, the plan is a promotion.
    const tier = policy.tiers.find((t) => t.name === r.tier);
    if (tier && tier.next !== undefined && ageMs >= tier.maxAgeMs) {
      return {
        recordId: r.id,
        seq: r.seq,
        currentTier: r.tier,
        action: 'promote',
        targetTier: tier.next,
        ageMs,
      };
    }
    return { recordId: r.id, seq: r.seq, currentTier: r.tier, action: 'keep', ageMs };
  }
}
