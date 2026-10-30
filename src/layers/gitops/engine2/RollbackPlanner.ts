/**
 * Rollback Planner — minimal revert between two revisions.
 *
 * "Roll back to revision R" naively means apply R wholesale — but that
 * rewrites every field, including ones that never changed since R. The
 * planner diffs the *current* revision against the *target* revision and
 * emits only the operations needed to close the gap:
 *
 *   - resource added since target      → delete it
 *   - resource removed since target    → re-create it (with the spec
 *     *as it was* in the target revision — not mutated to current state)
 *   - spec changed since target        → update, but only the changed
 *     fields are reverted (the rest are already at target values)
 *   - unchanged                        → nothing
 *
 * The result respects sync waves so dependents aren't orphaned — same
 * ordering as the forward reconcile path.
 *
 * Minimality matters: a 50-field Deployment that only drifted in
 * `replicas` gets a one-field revert, not a wholesale spec rewrite —
 * less surface for the rollback itself to break.
 *
 * Complexity: O(R + F) — one diff pass, same cost as drift detection.
 *
 * @module GitopsLayer/Engine2
 */

import {
  DesiredRevision,
  DiffAction,
  ResourceSpec,
  resourceKey,
} from '../engines/types';
import { RollbackPlan, RollbackStep } from './types';

export class RollbackPlanner {
  /**
   * Compute the minimal revert from `current` (what's applied now) back
   * to `target` (what should be applied).
   */
  plan(current: DesiredRevision, target: DesiredRevision): RollbackPlan {
    const steps: RollbackStep[] = [];
    let touchedFields = 0;

    // Resources in current but not target → delete (added since target).
    for (const [key, cur] of current.resources) {
      const tgt = target.resources.get(key);
      if (!tgt) {
        steps.push({
          resourceKey: key,
          action: DiffAction.Delete,
          fieldRestores: [],
          wave: cur.wave,
        });
        continue;
      }
      // Both exist — revert only the fields that changed.
      const restores = this._fieldRestores(tgt.spec, cur.spec, 'spec');
      if (restores.length > 0) {
        touchedFields += restores.length;
        steps.push({
          resourceKey: key,
          action: DiffAction.Update,
          fieldRestores: restores,
          wave: cur.wave,
        });
      }
    }

    // Resources in target but not current → re-create at target spec.
    for (const [key, tgt] of target.resources) {
      if (!current.resources.has(key)) {
        steps.push({
          resourceKey: key,
          action: DiffAction.Create,
          fieldRestores: [],
          wave: tgt.wave,
        });
      }
    }

    // Order: wave asc; within a wave creates < updates < deletes so a
    // rollback that removes a bad resource only does so after its
    // replacement exists.
    const rank = { [DiffAction.Create]: 0, [DiffAction.Update]: 1, [DiffAction.Delete]: 2, [DiffAction.Noop]: 3 };
    steps.sort((a, b) => a.wave - b.wave || rank[a.action] - rank[b.action]);

    return {
      fromRevisionId: current.id,
      toRevisionId: target.id,
      steps,
      touchedFieldCount: touchedFields,
    };
  }

  /**
   * The fields that differ between target and current specs — each with
   * the *target* value to restore. Missing-in-target = restore to absent
   * (value: undefined signals "delete this key").
   */
  private _fieldRestores(
    target: unknown,
    current: unknown,
    path: string
  ): { path: string; value: unknown }[] {
    if (this._deepEqual(target, current)) return [];
    if (this._isObj(target) && this._isObj(current)) {
      const out: { path: string; value: unknown }[] = [];
      const keys = new Set([...Object.keys(target), ...Object.keys(current)]);
      for (const k of keys) {
        out.push(...this._fieldRestores(target[k], current[k], `${path}.${k}`));
      }
      return out;
    }
    return [{ path, value: target }];
  }

  private _deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (this._isObj(a) && this._isObj(b)) {
      const ak = Object.keys(a);
      const bk = Object.keys(b);
      return ak.length === bk.length && ak.every((k) => this._deepEqual(a[k], b[k]));
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => this._deepEqual(v, b[i]));
    }
    return false;
  }

  private _isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }
}

/** Convenience for tests/callers: build a revision-shaped object. */
export function revision(id: string, resources: readonly ResourceSpec[]): DesiredRevision {
  const map = new Map<string, ResourceSpec>();
  for (const r of resources) map.set(resourceKey(r.kind, r.name), r);
  return {
    id,
    commit: { sha: id, author: 'rollback-planner', message: `rev ${id}`, timestamp: 0 },
    resources: map,
  };
}
