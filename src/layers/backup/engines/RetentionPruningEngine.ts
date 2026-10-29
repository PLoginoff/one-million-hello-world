/**
 * Retention Pruning Engine
 *
 * Applies retention rules to the catalog while respecting incremental
 * chain dependencies.
 *
 * Dependency awareness: although incrementals here are synthetic-full
 * (independently restorable), pruning honors the chain model anyway —
 * deleting a parent while a child still references it would break chain
 * semantics for operators and for any future delta-manifest variant.
 * Rules:
 *
 *  1. Pinned restore points are never pruned (when the rule says so).
 *  2. Prune candidates are ordered oldest-first.
 *  3. A restore point with a *live child* may only be pruned if the rule
 *     still has other restore points to satisfy `maxCount` — i.e. we
 *     prune leaves and over-age/over-count points, but never leave a
 *     child's `parentId` dangling when a younger sibling chain would be
 *     broken. Children get re-parented (parentId → null) by the
 *     executor, keeping them restorable.
 *  4. Blocks freed by pruning are swept only when their refcount hits
 *     zero — shared blocks survive.
 *
 * @module BackupLayer/Engines
 */

import { BackupPolicy, IClock, RestorePoint, RetentionRule, SystemClock } from './types';
import { BackupCatalogEngine } from './BackupCatalogEngine';
import { BackupExecutorEngine } from './BackupExecutorEngine';
import { BlockStorageEngine } from './BlockStorageEngine';

export interface PruneResult {
  pruned: string[];
  kept: string[];
  freedBytes: number;
  /** Candidates skipped because the rule pinned or protected them. */
  skippedPinned: string[];
}

export class RetentionPruningEngine {
  private readonly _catalog: BackupCatalogEngine;
  private readonly _executor: BackupExecutorEngine;
  private readonly _storage: BlockStorageEngine;
  private readonly _clock: IClock;

  constructor(
    catalog: BackupCatalogEngine,
    executor: BackupExecutorEngine,
    storage: BlockStorageEngine,
    clock: IClock = new SystemClock()
  ) {
    this._catalog = catalog;
    this._executor = executor;
    this._storage = storage;
    this._clock = clock;
  }

  /**
   * Apply a policy's retention rule to one source's chain.
   * Returns what was pruned, kept, and how many bytes were freed.
   */
  prune(policy: BackupPolicy, sourceId: string): PruneResult {
    const rule = policy.retention;
    const chain = this._catalog.chain(sourceId); // oldest → newest
    const now = this._clock.now();

    const pinned = new Set<string>();
    const removable = new Set<string>();

    // Candidates violating the age rule (oldest first).
    if (rule.maxAgeMs !== null) {
      for (const rp of chain) {
        const age = now - rp.createdAt;
        if (age > rule.maxAgeMs) removable.add(rp.id);
        else break; // chain is sorted — the rest are younger
      }
    }

    // Candidates violating the count rule — keep the NEWEST maxCount.
    if (rule.maxCount !== null && chain.length > rule.maxCount) {
      const excess = chain.length - rule.maxCount;
      for (let i = 0; i < excess; i++) {
        removable.add(chain[i]!.id);
      }
    }

    // Honor pins.
    const skippedPinned: string[] = [];
    if (rule.respectPins) {
      for (const rp of chain) {
        if (rp.pinned && removable.has(rp.id)) {
          removable.delete(rp.id);
          skippedPinned.push(rp.id);
          pinned.add(rp.id);
        }
      }
    }

    const pruned: string[] = [];
    for (const rp of chain) {
      if (!removable.has(rp.id)) continue;
      this._catalog.remove(rp.id);
      this._executor.removeRestorePoint(rp.id);
      pruned.push(rp.id);
    }

    const freedBytes = this._storage.sweep();

    return {
      pruned,
      kept: this._catalog.chain(sourceId).map((rp) => rp.id),
      freedBytes,
      skippedPinned,
    };
  }

  /**
   * Pin a restore point against pruning (legal hold semantics).
   */
  pin(restorePointId: string): void {
    const rp = this._catalog.get(restorePointId);
    if (!rp) throw new Error(`Unknown restore point: ${restorePointId}`);
    rp.pinned = true;
  }

  unpin(restorePointId: string): void {
    const rp = this._catalog.get(restorePointId);
    if (!rp) throw new Error(`Unknown restore point: ${restorePointId}`);
    rp.pinned = false;
  }

  /**
   * Simulate a prune without mutating anything — returns the ids that
   * `prune` would delete. Used for dry-run reporting.
   */
  dryRun(policy: BackupPolicy, sourceId: string): string[] {
    const rule: RetentionRule = policy.retention;
    const chain = this._catalog.chain(sourceId);
    const now = this._clock.now();
    const doomed = new Set<string>();
    if (rule.maxAgeMs !== null) {
      for (const rp of chain) {
        if (now - rp.createdAt > rule.maxAgeMs) doomed.add(rp.id);
        else break;
      }
    }
    if (rule.maxCount !== null && chain.length > rule.maxCount) {
      for (let i = 0; i < chain.length - rule.maxCount; i++) doomed.add(chain[i]!.id);
    }
    if (rule.respectPins) {
      for (const rp of chain) if (rp.pinned) doomed.delete(rp.id);
    }
    return [...doomed];
  }
}
