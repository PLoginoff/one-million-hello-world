/**
 * CompatibilityChecker — real field-level schema compatibility.
 *
 * Direction semantics (Confluent-style):
 *
 *  - BACKWARD check: can the NEW schema read data written by the OLD?
 *    * Field present in old but absent in new: OK (reader ignores it).
 *    * Field in new but absent in old: MUST have a default (reader
 *      fills it). No default => incompatible.
 *    * Field in both: writer type must be readable as reader type
 *      (identical, or a permitted promotion int->long->float->double;
 *      narrowing is incompatible).
 *
 *  - FORWARD check: mirror image — can the OLD read data written by NEW?
 *    * Field in old but absent in new: needs default in OLD schema.
 *    * Field in new but absent in old: OK (old reader skips it).
 *    * Field in both: new type must be readable as old type.
 *
 *  - FULL: both directions. *_TRANSITIVE variants apply the check
 *    pairwise against every prior version.
 *
 * Nested records are compared recursively with dotted paths; unions are
 * compared branch-wise (every writer branch needs a readable reader
 * branch).
 *
 * @module SchemaRegistry/Registry
 */

import {
  CompatibilityMode,
  CompatibilityReport,
  ChangeKind,
  SchemaDiff,
} from './types';
import {
  isObject,
  isRecord,
  recordFields,
  typeCompatible,
  FieldDef,
} from './SchemaModel';

export class CompatibilityChecker {
  private readonly _allowWidening: boolean;

  constructor(allowWidening = true) {
    this._allowWidening = allowWidening;
  }

  /**
   * Check `candidate` against `prior` under `mode`.
   * `prior` = existing schema; `candidate` = new schema being registered.
   * For transitive modes the caller invokes this once per prior version.
   */
  check(prior: unknown, candidate: unknown, mode: CompatibilityMode): CompatibilityReport {
    switch (mode) {
      case CompatibilityMode.NONE:
        return { compatible: true, violations: [], diffs: this.diff(prior, candidate) };
      case CompatibilityMode.BACKWARD:
      case CompatibilityMode.BACKWARD_TRANSITIVE:
        return this._directional(prior, candidate, 'backward');
      case CompatibilityMode.FORWARD:
      case CompatibilityMode.FORWARD_TRANSITIVE:
        return this._directional(prior, candidate, 'forward');
      case CompatibilityMode.FULL:
      case CompatibilityMode.FULL_TRANSITIVE: {
        const b = this._directional(prior, candidate, 'backward');
        const f = this._directional(prior, candidate, 'forward');
        return {
          compatible: b.compatible && f.compatible,
          violations: [...b.violations, ...f.violations],
          diffs: mergeDiffs(b.diffs, f.diffs),
        };
      }
    }
  }

  /**
   * Full field-level diff between two schemas (for reporting; not
   * direction-sensitive — uses backward direction for type judgments).
   */
  diff(oldSchema: unknown, newSchema: unknown): SchemaDiff[] {
    const diffs: SchemaDiff[] = [];
    if (isRecord(oldSchema) && isRecord(newSchema)) {
      this._diffRecords(oldSchema, newSchema, '', diffs);
    } else if (canonicalTypeKey(oldSchema) !== canonicalTypeKey(newSchema)) {
      diffs.push({ kind: ChangeKind.FIELD_TYPE_CHANGED, path: 'root', detail: 'schema type changed' });
    }
    return diffs;
  }

  // ------------------------------------------------------------------

  private _directional(prior: unknown, candidate: unknown, dir: 'backward' | 'forward'): CompatibilityReport {
    // For backward: writer=prior(old data), reader=candidate(new schema)
    // For forward:  writer=candidate(new data), reader=prior(old schema)
    const writer = dir === 'backward' ? prior : candidate;
    const reader = dir === 'backward' ? candidate : prior;
    const violations: string[] = [];

    const cmp = (w: Record<string, unknown>, r: Record<string, unknown>): boolean =>
      this._recordsCompatible(w, r, '', violations, dir);

    if (isRecord(writer) && isRecord(reader)) {
      this._recordsCompatible(writer, reader, '', violations, dir);
    } else {
      const ok = typeCompatible(writer, reader, this._allowWidening, cmp);
      if (!ok) {
        violations.push(`top-level type change is not ${dir}-compatible`);
      }
    }
    return {
      compatible: violations.length === 0,
      violations,
      diffs: this.diff(prior, candidate),
    };
  }

  /**
   * Compare writer-record vs reader-record fields.
   * Reader direction decides defaults enforcement: a reader field with
   * no writer counterpart must have a default.
   */
  private _recordsCompatible(
    writer: Record<string, unknown>,
    reader: Record<string, unknown>,
    path: string,
    violations: string[],
    dir: 'backward' | 'forward'
  ): boolean {
    const wFields = new Map<string, FieldDef>();
    for (const f of recordFields(writer, path || 'root')) wFields.set(f.name, f);
    const rFields = new Map<string, FieldDef>();
    for (const f of recordFields(reader, path || 'root')) rFields.set(f.name, f);

    let ok = true;
    for (const [name, rf] of rFields) {
      const wf = wFields.get(name);
      const p = path ? `${path}.${name}` : name;
      if (!wf) {
        if (!rf.hasDefault) {
          violations.push(`field '${p}': present in reader but absent in writer and has no default (${dir})`);
          ok = false;
        }
        continue;
      }
      if (!typeCompatible(wf.type, rf.type, this._allowWidening,
        (w, r) => this._recordsCompatible(w, r, p, violations, dir))) {
        violations.push(`field '${p}': writer type not readable as reader type (${dir})`);
        ok = false;
      }
    }
    // Fields in writer but missing in reader are safe for backward
    // (reader ignores unknown data). For forward they'd need defaults
    // in the OLD schema — symmetric case handled by the swapped call.
    return ok;
  }

  // ------------------------------------------------------------------
  // Diff machinery (field-level, direction-agnostic)
  // ------------------------------------------------------------------

  private _diffRecords(
    oldRec: Record<string, unknown>,
    newRec: Record<string, unknown>,
    path: string,
    diffs: SchemaDiff[]
  ): void {
    const oldFields = new Map(recordFields(oldRec, path || 'root').map((f) => [f.name, f]));
    const newFields = new Map(recordFields(newRec, path || 'root').map((f) => [f.name, f]));

    for (const [name, nf] of newFields) {
      const p = path ? `${path}.${name}` : name;
      const of = oldFields.get(name);
      if (!of) {
        diffs.push({
          kind: nf.hasDefault ? ChangeKind.FIELD_ADDED_WITH_DEFAULT : ChangeKind.FIELD_ADDED,
          path: p,
          detail: nf.hasDefault ? 'added with default' : 'added without default',
        });
        continue;
      }
      this._diffField(of, nf, p, diffs);
    }
    for (const [name, of] of oldFields) {
      if (!newFields.has(name)) {
        const p = path ? `${path}.${name}` : name;
        diffs.push({
          kind: of.hasDefault ? ChangeKind.FIELD_REMOVED_HAD_DEFAULT : ChangeKind.FIELD_REMOVED,
          path: p,
          detail: of.hasDefault ? 'removed (had default)' : 'removed (no default)',
        });
      }
    }
  }

  private _diffField(of: FieldDef, nf: FieldDef, path: string, diffs: SchemaDiff[]): void {
    if (isRecord(of.type) && isRecord(nf.type)) {
      this._diffRecords(of.type, nf.type, path, diffs);
      return;
    }
    const oKey = canonicalTypeKey(of.type);
    const nKey = canonicalTypeKey(nf.type);
    if (oKey === nKey) {
      if (of.hasDefault !== nf.hasDefault || JSON.stringify(of.default) !== JSON.stringify(nf.default)) {
        diffs.push({ kind: ChangeKind.FIELD_DEFAULT_CHANGED, path, detail: 'default changed' });
      }
      return;
    }
    // Widened or narrowed?
    const widened = typeCompatible(of.type, nf.type, this._allowWidening, () => true);
    const narrowed = typeCompatible(nf.type, of.type, this._allowWidening, () => true);
    if (widened && !narrowed) {
      diffs.push({ kind: ChangeKind.FIELD_TYPE_WIDENED, path, detail: `${oKey} -> ${nKey}` });
    } else if (narrowed && !widened) {
      diffs.push({ kind: ChangeKind.FIELD_TYPE_NARROWED, path, detail: `${oKey} -> ${nKey}` });
    } else {
      diffs.push({ kind: ChangeKind.FIELD_TYPE_CHANGED, path, detail: `${oKey} -> ${nKey}` });
    }
  }
}

function canonicalTypeKey(t: unknown): string {
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return `union(${t.map(canonicalTypeKey).sort().join('|')})`;
  if (isObject(t)) return JSON.stringify(t);
  return String(t);
}

function mergeDiffs(a: SchemaDiff[], b: SchemaDiff[]): SchemaDiff[] {
  const seen = new Set<string>();
  const out: SchemaDiff[] = [];
  for (const d of [...a, ...b]) {
    const k = `${d.kind}|${d.path}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(d);
    }
  }
  return out;
}
