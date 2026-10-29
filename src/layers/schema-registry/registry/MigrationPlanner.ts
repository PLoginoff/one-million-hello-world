/**
 * MigrationPlanner — derive an explicit field-level migration plan
 * between two schema versions.
 *
 * Consumes the checker's diff and emits ordered operations a data
 * migration would perform:
 *
 *   add_field (backfill default) | drop_field | widen | narrow | rewrite
 *
 * The planner also reports whether the migration is lossless (all data
 * representable in the new schema) or lossy (drops/narrows) so operators
 * can gate destructive migrations behind approval.
 *
 * @module SchemaRegistry/Registry
 */

import { CompatibilityChecker } from './CompatibilityChecker';
import { ChangeKind, SchemaDiff } from './types';

export enum MigrationOp {
  ADD_FIELD = 'add_field',
  DROP_FIELD = 'drop_field',
  WIDEN_FIELD = 'widen_field',
  NARROW_FIELD = 'narrow_field',
  RETYPE_FIELD = 'retype_field',
  SET_DEFAULT = 'set_default',
}

export interface MigrationStep {
  op: MigrationOp;
  path: string;
  detail: string;
  /** True when the step discards or degrades data. */
  lossy: boolean;
}

export interface MigrationPlan {
  steps: MigrationStep[];
  /** All steps lossless — a pure additive/compatible evolution. */
  lossless: boolean;
  /** Distinct fields touched. */
  fieldsTouched: number;
}

export class MigrationPlanner {
  private readonly _checker: CompatibilityChecker;

  constructor(allowWidening = true) {
    this._checker = new CompatibilityChecker(allowWidening);
  }

  /** Plan a migration FROM `oldSchema` TO `newSchema`. */
  plan(oldSchema: unknown, newSchema: unknown): MigrationPlan {
    const diffs = this._checker.diff(oldSchema, newSchema);
    const steps = diffs.map((d) => MigrationPlanner._step(d));
    const fields = new Set(steps.map((s) => s.path));
    return {
      steps,
      lossless: steps.every((s) => !s.lossy),
      fieldsTouched: fields.size,
    };
  }

  private static _step(d: SchemaDiff): MigrationStep {
    switch (d.kind) {
      case ChangeKind.FIELD_ADDED:
        return { op: MigrationOp.ADD_FIELD, path: d.path, detail: 'add field (no default — backfill required)', lossy: false };
      case ChangeKind.FIELD_ADDED_WITH_DEFAULT:
        return { op: MigrationOp.ADD_FIELD, path: d.path, detail: 'add field with default backfill', lossy: false };
      case ChangeKind.FIELD_REMOVED:
      case ChangeKind.FIELD_REMOVED_HAD_DEFAULT:
        return { op: MigrationOp.DROP_FIELD, path: d.path, detail: d.detail, lossy: true };
      case ChangeKind.FIELD_TYPE_WIDENED:
        return { op: MigrationOp.WIDEN_FIELD, path: d.path, detail: d.detail, lossy: false };
      case ChangeKind.FIELD_TYPE_NARROWED:
        return { op: MigrationOp.NARROW_FIELD, path: d.path, detail: d.detail, lossy: true };
      case ChangeKind.FIELD_TYPE_CHANGED:
        return { op: MigrationOp.RETYPE_FIELD, path: d.path, detail: d.detail, lossy: true };
      case ChangeKind.FIELD_DEFAULT_CHANGED:
        return { op: MigrationOp.SET_DEFAULT, path: d.path, detail: d.detail, lossy: false };
      case ChangeKind.FIELD_RENAMED:
        return { op: MigrationOp.RETYPE_FIELD, path: d.path, detail: d.detail, lossy: true };
      default:
        return { op: MigrationOp.RETYPE_FIELD, path: d.path, detail: d.detail, lossy: true };
    }
  }
}
