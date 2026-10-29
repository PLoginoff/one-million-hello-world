/**
 * Restore Planner Engine
 *
 * Answers "which restore points do I need to recover source S at time T?"
 *
 * Because incrementals here are synthetic-full (each captures a complete
 * manifest), the minimal plan for a point-in-time restore is just the
 * single latest restore point ≤ T. But the engine also emits the full
 * dependency chain (base full + every incremental up to the target),
 * which matters for:
 *
 *  - prune safety: an incremental's blocks may physically live in the
 *    store under its parent's namespace in non-synthetic variants;
 *  - forensics: operators see the full provenance of a restore;
 *  - non-synthetic backends: the plan is already correct if incrementals
 *    ever switch to delta manifests.
 *
 * Chain walk follows `parentId` links to the root full — O(chain depth).
 *
 * @module BackupLayer/Engines
 */

import { RestorePlan, RestorePoint, RestoreStep } from './types';
import { BackupCatalogEngine } from './BackupCatalogEngine';

export class RestorePlannerEngine {
  private readonly _catalog: BackupCatalogEngine;

  constructor(catalog: BackupCatalogEngine) {
    this._catalog = catalog;
  }

  /**
   * Build a restore plan for `sourceId` at `targetMs`.
   * Throws when no restore point exists at-or-before the target.
   */
  plan(sourceId: string, targetMs: number): RestorePlan {
    const tip = this._catalog.latestBefore(sourceId, targetMs);
    if (!tip) {
      throw new Error(`No restore point for '${sourceId}' at or before ${new Date(targetMs).toISOString()}`);
    }

    // Walk parent links to collect the dependency chain, oldest first.
    const chain: RestorePoint[] = [];
    let cursor: RestorePoint | null = tip;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor.id)) break; // defensive: corrupted parent cycle
      seen.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.parentId ? this._getById(cursor.parentId) : null;
    }

    const steps: RestoreStep[] = chain.map((rp) => ({
      restorePointId: rp.id,
      kind: rp.kind,
      createdAt: rp.createdAt,
      objects: rp.objects.map((o) => o.name),
    }));

    return {
      sourceId,
      targetTimeMs: targetMs,
      steps,
      restorableObjects: tip.objects.map((o) => o.name),
    };
  }

  /**
   * Objects present in the latest restore point ≤ targetMs whose content
   * changed between that point and its parent — the "what changed"
   * report used to pick which objects actually need restoring.
   */
  changedObjects(sourceId: string, targetMs: number): string[] {
    const tip = this._catalog.latestBefore(sourceId, targetMs);
    if (!tip || !tip.parentId) return tip ? tip.objects.map((o) => o.name) : [];
    const parent = this._getById(tip.parentId);
    if (!parent) return tip.objects.map((o) => o.name);
    const parentChecksums = new Map(parent.objects.map((o) => [o.name, o.checksum]));
    return tip.objects
      .filter((o) => parentChecksums.get(o.name) !== o.checksum)
      .map((o) => o.name);
  }

  /** All restore points strictly newer than `targetMs` for a source. */
  newerThan(sourceId: string, targetMs: number): RestorePoint[] {
    return this._catalog.chain(sourceId).filter((rp) => rp.createdAt > targetMs);
  }

  private _getById(id: string): RestorePoint | null {
    return this._catalog.get(id);
  }
}
