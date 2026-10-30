/**
 * SchemaDiffView — field-level diff data with compatibility verdicts.
 *
 * Wraps `CompatibilityChecker.diff()` and enriches each change into a
 * render-ready row: which field changed, how, whether the change is a
 * breaking one under each compatibility mode, and a suggested consumer
 * action.
 *
 * The registry answers "is candidate X compatible with subject S?";
 * the diff view answers "show me the field-level delta between v3 and
 * v5, and which consumers should care".
 *
 * Change severity model (writer→reader direction):
 *   BREAKING:   field removed without default, type narrowed/changed
 *   CAUTION:    type widened (old readers may not handle new values),
 *               default changed, field renamed
 *   SAFE:       field added (with or without default per mode),
 *               field removed that had a default
 *
 * @module SchemaRegistry/Engine2
 */

import { CompatibilityChecker } from '../registry/CompatibilityChecker';
import type { SchemaDiff, CompatibilityReport } from '../registry/types';
import { ChangeKind } from '../registry/types';

// ------------------------------------------------------------------ types

export type DiffSeverity = 'breaking' | 'caution' | 'safe';

/** One render-ready diff row. */
export interface DiffRow {
  readonly path: string;
  readonly kind: ChangeKind;
  readonly severity: DiffSeverity;
  readonly detail: string;
  /** Recommended consumer action. */
  readonly action: string;
}

/** A diff between two schema versions, annotated. */
export interface SchemaDiffView {
  /** Sorted rows — breaking first, then caution, then safe. */
  readonly rows: DiffRow[];
  readonly breaking: number;
  readonly caution: number;
  readonly safe: number;
  /** Worst severity present ('none' when identical). */
  readonly worstSeverity: DiffSeverity | 'none';
  /** One-line summary for dashboards/PR comments. */
  readonly headline: string;
  /** Underlying checker verdict (backward direction). */
  readonly compatibility: CompatibilityReport;
}

const SEVERITY_ORDER: Record<DiffSeverity, number> = { breaking: 0, caution: 1, safe: 2 };

/** Classify a change kind's severity. */
export function severityOf(kind: ChangeKind): DiffSeverity {
  switch (kind) {
    case ChangeKind.FIELD_REMOVED:
    case ChangeKind.FIELD_TYPE_NARROWED:
    case ChangeKind.FIELD_TYPE_CHANGED:
      return 'breaking';
    case ChangeKind.FIELD_TYPE_WIDENED:
    case ChangeKind.FIELD_DEFAULT_CHANGED:
    case ChangeKind.FIELD_RENAMED:
    case ChangeKind.FIELD_ADDED:
      return 'caution';
    case ChangeKind.FIELD_ADDED_WITH_DEFAULT:
    case ChangeKind.FIELD_REMOVED_HAD_DEFAULT:
      return 'safe';
  }
}

/** Consumer-facing recommendation per change kind. */
export function actionFor(kind: ChangeKind): string {
  switch (kind) {
    case ChangeKind.FIELD_ADDED:
      return 'consumers must tolerate an unknown field; verify ignore-unknown settings';
    case ChangeKind.FIELD_ADDED_WITH_DEFAULT:
      return 'safe — old readers will fill the default';
    case ChangeKind.FIELD_REMOVED:
      return 'BREAKING — consumers reading this field must migrate first';
    case ChangeKind.FIELD_REMOVED_HAD_DEFAULT:
      return 'safe — readers fall back to the documented default';
    case ChangeKind.FIELD_TYPE_WIDENED:
      return 'readers on the narrower type may truncate; audit consumer deserializers';
    case ChangeKind.FIELD_TYPE_NARROWED:
      return 'BREAKING — previously valid values may no longer serialize';
    case ChangeKind.FIELD_TYPE_CHANGED:
      return 'BREAKING — incompatible representations; requires coordinated migration';
    case ChangeKind.FIELD_RENAMED:
      return 'treat as remove+add; consumers must map the old name';
    case ChangeKind.FIELD_DEFAULT_CHANGED:
      return 'old payloads unchanged; new defaults apply to absent fields only';
  }
}

// ------------------------------------------------------------------ view builder

export class SchemaDiffViewBuilder {
  private readonly _checker: CompatibilityChecker;

  constructor(checker?: CompatibilityChecker) {
    this._checker = checker ?? new CompatibilityChecker();
  }

  /**
   * Build an annotated view of `checker.diff(old, new)` plus a
   * compatibility check under `mode`.
   */
  build(
    oldSchema: unknown,
    newSchema: unknown,
    mode: Parameters<CompatibilityChecker['check']>[2],
  ): SchemaDiffView {
    const diffs = this._checker.diff(oldSchema, newSchema);
    const compatibility = this._checker.check(oldSchema, newSchema, mode);
    return this.fromDiffs(diffs, compatibility);
  }

  /** Annotate a precomputed diff list. */
  fromDiffs(diffs: SchemaDiff[], compatibility: CompatibilityReport): SchemaDiffView {
    const rows: DiffRow[] = diffs
      .map((d) => ({
        path: d.path,
        kind: d.kind,
        severity: severityOf(d.kind),
        detail: d.detail,
        action: actionFor(d.kind),
      }))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.path.localeCompare(b.path));

    const breaking = rows.filter((r) => r.severity === 'breaking').length;
    const caution = rows.filter((r) => r.severity === 'caution').length;
    const safe = rows.filter((r) => r.severity === 'safe').length;
    const worst = breaking > 0 ? 'breaking' : caution > 0 ? 'caution' : safe > 0 ? 'safe' : 'none';

    const headline = rows.length === 0
      ? 'identical schemas'
      : `${rows.length} change${rows.length === 1 ? '' : 's'}: ${breaking} breaking, ${caution} caution, ${safe} safe` +
        (compatibility.compatible ? ' — compatible' : ' — INCOMPATIBLE');

    return { rows, breaking, caution, safe, worstSeverity: worst, headline, compatibility };
  }

  /**
   * Render rows as a markdown-ish table — PR-comment ready.
   */
  static toTable(view: SchemaDiffView): string {
    if (view.rows.length === 0) return view.headline;
    const lines = [
      `| severity | path | change | detail |`,
      `|---|---|---|---|`,
      ...view.rows.map((r) => `| ${r.severity} | \`${r.path}\` | ${r.kind} | ${r.detail} |`),
    ];
    return `${view.headline}\n${lines.join('\n')}`;
  }
}
