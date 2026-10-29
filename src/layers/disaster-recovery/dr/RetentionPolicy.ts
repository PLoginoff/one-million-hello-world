/**
 * Disaster Recovery — GFS Backup Retention Policy
 *
 * Grandfather-Father-Son retention: keep the newest backup per tier bucket —
 * e.g. last N hourly, last M daily, last K weekly. Evaluated against backup
 * timestamps, this produces the classic exponentially-thinning archive where
 * recent backups are dense and old ones sparse.
 *
 * Algorithm: bucket each backup into (tier, bucketStart) by floor(t / unit).
 * Within each (tier,bucket) keep only the NEWEST backup; then keep at most
 * `keep` buckets per tier (newest buckets win). Everything else is prunable.
 * O(B log B) for B backups (a sort dominates).
 *
 * @module DisasterRecovery/DR
 */

import { DrClock } from './DrTypes';

export interface RetentionTier {
  readonly name: string;
  /** Bucket granularity in ms (e.g. 3_600_000 for hourly). */
  readonly unitMs: number;
  /** How many of the newest buckets to keep. */
  readonly keep: number;
}

export interface RetentionInput {
  readonly backupId: string;
  readonly createdAt: number;
}

export interface RetentionDecision {
  readonly backupId: string;
  readonly keep: boolean;
  readonly tier?: string;
  readonly reason: string;
}

/** Standard policy: 24 hourly + 7 daily + 4 weekly. */
export const GFS_STANDARD: ReadonlyArray<RetentionTier> = [
  { name: 'hourly', unitMs: 3_600_000, keep: 24 },
  { name: 'daily', unitMs: 86_400_000, keep: 7 },
  { name: 'weekly', unitMs: 604_800_000, keep: 4 },
];

export class RetentionPolicy {
  private readonly _tiers: ReadonlyArray<RetentionTier>;
  private readonly _clock: DrClock;

  constructor(tiers: ReadonlyArray<RetentionTier> = GFS_STANDARD, clock: DrClock = Date.now) {
    if (tiers.length === 0) throw new Error('at least one retention tier required');
    // Finer granularity first — a backup eligible for multiple buckets is
    // claimed by the FINEST tier (hourly wins over daily for the same hour).
    this._tiers = [...tiers].sort((a, b) => a.unitMs - b.unitMs);
    this._clock = clock;
  }

  get tiers(): ReadonlyArray<RetentionTier> {
    return this._tiers;
  }

  /**
   * Evaluate every backup: mark keep/prune. Returns one decision per input.
   */
  evaluate(backups: ReadonlyArray<RetentionInput>): RetentionDecision[] {
    const keep = this._keepSet(backups);
    return backups.map((b) =>
      keep.has(b.backupId)
        ? { backupId: b.backupId, keep: true, tier: keep.get(b.backupId), reason: `kept as ${keep.get(b.backupId)}` }
        : { backupId: b.backupId, keep: false, reason: 'superseded by newer backup in same bucket' }
    );
  }

  /** Just the prunable ids — convenient for delete passes. */
  prunable(backups: ReadonlyArray<RetentionInput>): string[] {
    return this.evaluate(backups)
      .filter((d) => !d.keep)
      .map((d) => d.backupId);
  }

  /** Just the kept ids. */
  retained(backups: ReadonlyArray<RetentionInput>): string[] {
    return this.evaluate(backups)
      .filter((d) => d.keep)
      .map((d) => d.backupId);
  }

  /**
   * Compute the set of backups to keep. A backup claims the finest tier whose
   * bucket it is the newest member of; the newest `keep` buckets per tier win.
   * The newest backup overall is ALWAYS kept (it is the current recovery point).
   */
  private _keepSet(backups: ReadonlyArray<RetentionInput>): Map<string, string> {
    const keep = new Map<string, string>();
    if (backups.length === 0) return keep;
    const now = this._clock();
    const sorted = [...backups].sort((a, b) => b.createdAt - a.createdAt);
    const newestId = sorted[0].backupId;

    // For each tier: bucket → newest backup in bucket.
    for (const tier of this._tiers) {
      const buckets = new Map<number, RetentionInput>();
      for (const b of sorted) {
        // Buckets anchored at now so "the current hour" is bucket 0.
        const bucket = Math.floor((now - b.createdAt) / tier.unitMs);
        const existing = buckets.get(bucket);
        if (!existing || b.createdAt > existing.createdAt) {
          buckets.set(bucket, b);
        }
      }
      // Keep the `keep` smallest (most recent) buckets.
      const recent = [...buckets.entries()].sort((a, c) => a[0] - c[0]).slice(0, tier.keep);
      for (const [, b] of recent) {
        if (!keep.has(b.backupId)) keep.set(b.backupId, tier.name);
      }
    }
    keep.set(newestId, keep.get(newestId) ?? 'latest');
    return keep;
  }
}
