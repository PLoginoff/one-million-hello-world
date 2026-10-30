/**
 * Backup Schedule Optimizer
 *
 * Picks backup intervals that minimize RPO (recovery-point objective =
 * expected data-loss window) while respecting a storage budget.
 *
 * Model: each source churns `changeBytesPerMs` of unique data; a full
 * backup every `T` ms costs `sizeBytes + churn×T` stored bytes (a full
 * plus the deduplicated deltas it supersedes), amortized over the
 * retention horizon. RPO ≈ T/2 (average loss when a crash lands midway
 * through an interval).
 *
 * The optimizer grid-searches candidate intervals over `[minIntervalMs,
 * maxIntervalMs]` and picks the smallest T whose amortized storage fits
 * the budget — a monotone trade-off so a coarse scan + refine pass is
 * sufficient (no LP solver needed).
 *
 * @module BackupLayer/Engine2
 */

export interface SourceWorkload {
  readonly sourceId: string;
  /** Current full-backup size in bytes. */
  readonly sizeBytes: number;
  /** Bytes changed per ms (unique new data needing new blocks). */
  readonly changeBytesPerMs: number;
  /** How long restore points are retained (ms). */
  readonly retentionMs: number;
}

export interface OptimizeConstraints {
  /** Total storage budget across all sources (bytes). */
  readonly storageBudgetBytes: number;
  /** Smallest interval the infra supports. */
  readonly minIntervalMs: number;
  /** Largest interval worth considering. */
  readonly maxIntervalMs: number;
  /** Hard RPO requirement — optimizer rejects plans violating it. */
  readonly maxRpoMs?: number;
}

export interface SourcePlan {
  readonly sourceId: string;
  readonly intervalMs: number;
  /** Expected data-loss window = interval/2. */
  readonly expectedRpoMs: number;
  /** Amortized bytes the schedule consumes. */
  readonly storageBytes: number;
  /** Backups retained concurrently at this interval. */
  readonly restorePointsRetained: number;
}

export interface OptimizedSchedule {
  readonly plans: readonly SourcePlan[];
  readonly totalStorageBytes: number;
  readonly worstRpoMs: number;
  readonly feasible: boolean;
  /** Why infeasible (when it is). */
  readonly reason?: string;
}

/**
 * Amortized storage for a source backed up every `intervalMs` over its
 * retention horizon: each retained restore point holds the full object
 * set's worth of blocks the FIRST time, then only churn deltas after
 * dedup — so retained storage ≈ size + churn × retention horizon.
 * Independent of interval for capacity; interval only changes how much
 * churn each individual restore point carries. We therefore model
 * per-interval cost as churn×interval and cap restore points at
 * retention/interval.
 */
export function amortizedStorage(w: SourceWorkload, intervalMs: number): number {
  const retained = Math.max(1, Math.floor(w.retentionMs / intervalMs));
  // Full size for the base + one delta-per-interval of unique churn.
  return w.sizeBytes + w.changeBytesPerMs * Math.min(w.retentionMs, retained * intervalMs);
}

export class ScheduleOptimizer {
  /**
   * Grid-search per-source intervals. Each source is optimized
   * independently under a shared budget by ranking candidates on
   * RPO-per-byte; a greedy allocator picks the tightest affordable
   * interval per source.
   */
  optimize(workloads: readonly SourceWorkload[], c: OptimizeConstraints): OptimizedSchedule {
    if (workloads.length === 0) {
      return { plans: [], totalStorageBytes: 0, worstRpoMs: 0, feasible: true };
    }

    // Candidate intervals: log-spaced grid — fine granularity near the
    // min where RPO improvement is steepest per interval-ms spent.
    const candidates: number[] = [];
    let t = c.minIntervalMs;
    while (t < c.maxIntervalMs) {
      candidates.push(t);
      t *= 2;
    }
    candidates.push(c.maxIntervalMs);

    // Start every source at max interval (cheapest RPO ⇒ min storage? —
    // actually storage is roughly interval-independent in our model, so
    // we just pick the smallest feasible interval honoring maxRpo).
    const plans: SourcePlan[] = [];
    let total = 0;
    let worstRpo = 0;

    for (const w of workloads) {
      const chosen = this.pickInterval(w, candidates, c);
      if (chosen === undefined) {
        return {
          plans,
          totalStorageBytes: total,
          worstRpoMs: worstRpo,
          feasible: false,
          reason: `no interval in [${c.minIntervalMs}, ${c.maxIntervalMs}] satisfies maxRpoMs=${c.maxRpoMs} for source ${w.sourceId}`,
        };
      }
      const storage = amortizedStorage(w, chosen);
      plans.push({
        sourceId: w.sourceId,
        intervalMs: chosen,
        expectedRpoMs: chosen / 2,
        storageBytes: storage,
        restorePointsRetained: Math.max(1, Math.floor(w.retentionMs / chosen)),
      });
      total += storage;
      worstRpo = Math.max(worstRpo, chosen / 2);
    }

    if (total > c.storageBudgetBytes) {
      // Shrink: prefer fewer retained restore points by lengthening
      // intervals on the largest-storage sources until under budget.
      plans.sort((a, b) => b.storageBytes - a.storageBytes);
      for (const p of plans) {
        const w = workloads.find((x) => x.sourceId === p.sourceId)!;
        for (const cand of candidates) {
          if (cand <= p.intervalMs) continue;
          if (c.maxRpoMs !== undefined && cand / 2 > c.maxRpoMs) break;
          const s = amortizedStorage(w, cand);
          if (s >= p.storageBytes) continue;
          const saving = p.storageBytes - s;
          (p as { intervalMs: number }).intervalMs = cand;
          (p as { expectedRpoMs: number }).expectedRpoMs = cand / 2;
          (p as { storageBytes: number }).storageBytes = s;
          (p as { restorePointsRetained: number }).restorePointsRetained = Math.max(
            1,
            Math.floor(w.retentionMs / cand)
          );
          total -= saving;
          if (total <= c.storageBudgetBytes) break;
        }
        if (total <= c.storageBudgetBytes) break;
      }
    }

    if (total > c.storageBudgetBytes) {
      return {
        plans,
        totalStorageBytes: total,
        worstRpoMs: Math.max(...plans.map((p) => p.expectedRpoMs)),
        feasible: false,
        reason: `storage ${total} exceeds budget ${c.storageBudgetBytes}`,
      };
    }

    return {
      plans,
      totalStorageBytes: total,
      worstRpoMs: Math.max(...plans.map((p) => p.expectedRpoMs)),
      feasible: true,
    };
  }

  /** Smallest candidate interval satisfying maxRpoMs (RPO = interval/2). */
  private pickInterval(
    w: SourceWorkload,
    candidates: readonly number[],
    c: OptimizeConstraints
  ): number | undefined {
    for (const t of candidates) {
      if (c.maxRpoMs !== undefined && t / 2 > c.maxRpoMs) continue;
      return t; // grid is ascending — first feasible is tightest
    }
    return undefined;
  }
}
