/**
 * Drift Detection Engine
 *
 * Computes the structured diff between a desired revision and the live
 * state, per resource:
 *
 *  - desired but not live  → create
 *  - live but not desired  → delete
 *  - in both, specs differ → update (with field-level diffs)
 *  - identical             → noop (omitted from report)
 *
 * Field comparison is a recursive deep-equal walk producing dot-path
 * diffs (`spec.replicas`, `spec.env.DATABASE_URL`). Unknown/undefined
 * asymmetries are treated as missing fields, not drift, so sparse specs
 * don't flap.
 *
 * Complexity: O(R + F) where R = resources and F = total spec fields.
 *
 * @module GitopsLayer/Engines
 */

import {
  DesiredRevision,
  DiffAction,
  DriftReport,
  FieldDiff,
  LiveStore,
  ResourceDiff,
  ResourceSpec,
  resourceKey,
} from './types';

export class DriftDetectionEngine {
  private readonly _live: LiveStore;

  constructor(live: LiveStore) {
    this._live = live;
  }

  /** Compare a revision against live state; returns the drift report. */
  detect(revision: DesiredRevision): DriftReport {
    const diffs: ResourceDiff[] = [];
    const liveKeys = new Set(this._live.keys());
    let creates = 0;
    let updates = 0;
    let deletes = 0;

    for (const [key, desired] of revision.resources) {
      const live = this._live.get(key);
      if (!live) {
        creates++;
        diffs.push(this._diff(desired, DiffAction.Create, []));
        continue;
      }
      liveKeys.delete(key);
      const fieldDiffs = this._specDiff(desired.spec, live.spec, 'spec');
      if (fieldDiffs.length > 0) {
        updates++;
        diffs.push(this._diff(desired, DiffAction.Update, fieldDiffs));
      }
    }

    // Anything left in liveKeys exists live but isn't desired → delete.
    for (const key of liveKeys) {
      const live = this._live.get(key)!;
      deletes++;
      diffs.push(this._diff(live, DiffAction.Delete, []));
    }

    // Sort: wave asc, then creates < updates < deletes within a wave —
    // deletions run last so dependents aren't orphaned mid-reconcile.
    const actionRank = { [DiffAction.Create]: 0, [DiffAction.Update]: 1, [DiffAction.Delete]: 2, [DiffAction.Noop]: 3 };
    diffs.sort((a, b) => a.wave - b.wave || actionRank[a.action] - actionRank[b.action]);

    return {
      revisionId: revision.id,
      diffs,
      inSync: diffs.length === 0,
      creates,
      updates,
      deletes,
    };
  }

  /**
   * Recursive spec diff. Returns dot-path field diffs; treats missing
   * keys as undefined (a desired `undefined` ≠ live value → diff).
   */
  private _specDiff(desired: unknown, live: unknown, path: string): FieldDiff[] {
    if (this._deepEqual(desired, live)) return [];
    if (this._isPlainObject(desired) && this._isPlainObject(live)) {
      const out: FieldDiff[] = [];
      const d = desired as Record<string, unknown>;
      const l = live as Record<string, unknown>;
      const keys = new Set([...Object.keys(d), ...Object.keys(l)]);
      for (const k of keys) {
        out.push(...this._specDiff(d[k], l[k], `${path}.${k}`));
      }
      return out;
    }
    return [{ path, desired, live }];
  }

  private _deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (this._isPlainObject(a) && this._isPlainObject(b)) {
      const ao = a as Record<string, unknown>;
      const bo = b as Record<string, unknown>;
      const aKeys = Object.keys(ao);
      const bKeys = Object.keys(bo);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every((k) => this._deepEqual(ao[k], bo[k]));
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => this._deepEqual(v, b[i]));
    }
    return false;
  }

  private _isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  private _diff(r: ResourceSpec, action: DiffAction, fieldDiffs: FieldDiff[]): ResourceDiff {
    return {
      key: resourceKey(r.kind, r.name),
      kind: r.kind,
      name: r.name,
      action,
      fieldDiffs,
      wave: r.wave,
      dependsOn: [...r.dependsOn],
    };
  }
}
