/**
 * RetentionPolicy — GFS (grandfather-father-son) snapshot lifecycle.
 *
 * The GFS scheme keeps:
 *   - N "daily"   snapshots (most recent)
 *   - M "weekly"  snapshots (one per ISO week)
 *   - K "monthly" snapshots (one per calendar month)
 *   - optionally a minimum age (never delete anything younger than X ms)
 *
 * Snapshots may carry labels ('daily'|'weekly'|'monthly') — unlabeled
 * snapshots are treated as 'daily' candidates.
 *
 * The `evaluate` method is pure: it returns a plan listing which snapshots
 * to keep vs. delete. The `apply` method executes a plan against a
 * `SnapshotManager` — flattening any incremental snapshot whose parent
 * would be deleted first (chain-consistency preservation).
 *
 * @module SnapshotLayer/Implementations
 */

import type { SnapshotManager, StoredSnapshot } from './SnapshotManager';

// ------------------------------------------------------------------ types

/** Retention targets. */
export interface RetentionConfig {
  /** Keep the newest N snapshots regardless of age. */
  readonly keepLast: number;
  /** Keep one snapshot per day for the last `keepDaily` days. */
  readonly keepDaily: number;
  /** Keep one snapshot per ISO week for the last `keepWeekly` weeks. */
  readonly keepWeekly: number;
  /** Keep one snapshot per calendar month for `keepMonthly` months. */
  readonly keepMonthly: number;
  /** Minimum age in ms — younger snapshots are always kept. */
  readonly minAgeMs?: number;
}

/** One entry in an evaluation plan. */
export interface RetentionDecision {
  readonly snapshotId: string;
  readonly action: 'keep' | 'delete';
  /** Which rule decided the outcome. */
  readonly reason: string;
  /** For kept snapshots — which tier it satisfies. */
  readonly tier?: 'last' | 'daily' | 'weekly' | 'monthly' | 'min-age' | 'labeled';
}

export interface RetentionPlan {
  readonly decisions: RetentionDecision[];
  /** Snapshots to delete, in safe order (leaves → root). */
  readonly deleteOrder: string[];
  readonly keepCount: number;
  readonly deleteCount: number;
}

// --------------------------------------------------------------- helpers

/** ISO week key — e.g. '2026-W44'. Used for weekly dedup. */
function isoWeekKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  // ISO week: week containing the year's first Thursday.
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (day.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  day.setUTCDate(day.getUTCDate() - dayNum + 3); // move to Thursday
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((day.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Day key — 'YYYY-MM-DD' UTC. */
function dayKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

/** Month key — 'YYYY-MM' UTC. */
function monthKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 7);
}

// ------------------------------------------------------------------ policy

export class RetentionPolicy {
  private readonly _config: RetentionConfig;

  constructor(config: RetentionConfig) {
    this._config = config;
  }

  get config(): RetentionConfig {
    return this._config;
  }

  /**
   * Decide keep/delete for every snapshot. Pure — no side effects.
   *
   * Algorithm:
   *   1. Sort snapshots by takenAt descending (newest first).
   *   2. Always keep the newest `keepLast` snapshots (tier 'last').
   *   3. Always keep anything younger than `minAgeMs` (tier 'min-age').
   *   4. Walk remaining snapshots; for each, compute its day/week/month
   *      key. If we haven't kept a snapshot for that key yet and the
   *      tier still has quota → keep + consume quota.
   *   5. Everything else → delete.
   */
  evaluate(snapshots: readonly StoredSnapshot[], nowMs = Date.now()): RetentionPlan {
    const sorted = [...snapshots].sort((a, b) => b.takenAt - a.takenAt);
    const decisions = new Map<string, RetentionDecision>();
    const keptDayKeys = new Set<string>();
    const keptWeekKeys = new Set<string>();
    const keptMonthKeys = new Set<string>();
    let dailyUsed = 0;
    let weeklyUsed = 0;
    let monthlyUsed = 0;

    const keep = (s: StoredSnapshot, tier: RetentionDecision['tier'], reason: string): void => {
      decisions.set(s.id, { snapshotId: s.id, action: 'keep', reason, tier });
    };

    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i]!;
      // Rule 1: keep-last quota.
      if (i < this._config.keepLast) {
        keep(s, 'last', `within keep-last ${this._config.keepLast}`);
        continue;
      }
      // Rule 2: minimum age.
      if (
        this._config.minAgeMs !== undefined &&
        nowMs - s.takenAt < this._config.minAgeMs
      ) {
        keep(s, 'min-age', 'younger than min-age');
        continue;
      }
      // Rule 3: labeled snapshots with explicit retention labels are
      // always kept — a label marks the snapshot as special.
      if (s.labels.size > 0) {
        keep(s, 'labeled', `labeled: ${[...s.labels].join(',')}`);
        continue;
      }
      // Rule 4: GFS tiers.
      const dk = dayKey(s.takenAt);
      const wk = isoWeekKey(s.takenAt);
      const mk = monthKey(s.takenAt);
      if (dailyUsed < this._config.keepDaily && !keptDayKeys.has(dk)) {
        keptDayKeys.add(dk);
        dailyUsed += 1;
        keep(s, 'daily', `daily tier slot for ${dk}`);
        continue;
      }
      if (weeklyUsed < this._config.keepWeekly && !keptWeekKeys.has(wk)) {
        keptWeekKeys.add(wk);
        weeklyUsed += 1;
        keep(s, 'weekly', `weekly tier slot for ${wk}`);
        continue;
      }
      if (monthlyUsed < this._config.keepMonthly && !keptMonthKeys.has(mk)) {
        keptMonthKeys.add(mk);
        monthlyUsed += 1;
        keep(s, 'monthly', `monthly tier slot for ${mk}`);
        continue;
      }
      decisions.set(s.id, {
        snapshotId: s.id,
        action: 'delete',
        reason: 'no tier slot remaining',
      });
    }

    // Delete order: deepest descendants first — an incremental snapshot
    // must be deleted before its parent, otherwise restore() breaks.
    const depth = new Map<string, number>();
    const computeDepth = (s: StoredSnapshot, seen: Set<string>): number => {
      if (depth.has(s.id)) return depth.get(s.id)!;
      if (seen.has(s.id)) return 0; // cycle guard
      seen.add(s.id);
      const parent = s.parentId ? sorted.find((x) => x.id === s.parentId) : undefined;
      const d = parent ? computeDepth(parent, seen) + 1 : 0;
      depth.set(s.id, d);
      return d;
    };
    for (const s of sorted) computeDepth(s, new Set());
    const deleteOrder = sorted
      .filter((s) => decisions.get(s.id)?.action === 'delete')
      .sort((a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0))
      .map((s) => s.id);

    return {
      decisions: [...decisions.values()],
      deleteOrder,
      keepCount: [...decisions.values()].filter((d) => d.action === 'keep').length,
      deleteCount: [...decisions.values()].filter((d) => d.action === 'delete').length,
    };
  }

  /**
   * Execute the plan against a SnapshotManager. Before deleting a
   * snapshot that has surviving incremental children, the children are
   * flattened to preserve restorability.
   */
  apply(manager: SnapshotManager, plan: RetentionPlan): void {
    for (const id of plan.deleteOrder) {
      // If any surviving snapshot depends on this one, flatten it first.
      for (const child of manager.childrenOf(id)) {
        if (plan.decisions.find((d) => d.snapshotId === child.id)?.action === 'keep') {
          manager.flatten(child.id);
        }
      }
      manager.delete(id);
    }
  }
}
