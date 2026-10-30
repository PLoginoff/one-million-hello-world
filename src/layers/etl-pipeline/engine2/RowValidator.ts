/**
 * Row Validator — declarative per-column rules that feed the quarantine
 * stage.
 *
 * A validator is the "schema contract" a pipeline applies before
 * transformation: each rule names a column, a check, and the failure
 * message. Validation produces *all* violations (not just the first) so
 * a quarantined record carries the full picture.
 *
 * Checks: presence, non-null, type, range, regex, enum, custom
 * predicate. Rules compose per column; a row is valid when every rule
 * passes.
 *
 * @module EtlPipeline/Engine2
 */

import { Row } from '../engine/DagEngine';
import { SchemaColumn } from './PipelineVersioning';

export type CheckKind =
  | 'required'      // key present
  | 'nonNull'       // value !== null
  | 'type'          // typeof matches a SchemaColumnType
  | 'range'         // number within [min,max]
  | 'regex'         // string matches pattern
  | 'enum'          // value in a set
  | 'custom';       // predicate fn

export interface ColumnRule {
  readonly column: string;
  readonly check: CheckKind;
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: RegExp;
  readonly values?: readonly unknown[];
  readonly predicate?: (v: unknown) => boolean;
  readonly message?: string;
}

export interface Violation {
  readonly column: string;
  readonly check: CheckKind;
  readonly message: string;
}

export class ValidationError extends Error {
  readonly violations: readonly Violation[];
  constructor(violations: readonly Violation[]) {
    super(violations.map((v) => `${v.column}: ${v.message}`).join('; '));
    this.name = 'ValidationError';
    this.violations = violations;
  }
}

/**
 * Compile a `SchemaColumn[]` into type+nullability rules, plus extras.
 * This is the bridge between `PipelineVersioning`'s schema and the
 * quarantine stage — a row failing validation gets quarantined with a
 * `ValidationError` whose message fingerprints by violation shape.
 */
export function rulesFromSchema(
  columns: readonly SchemaColumn[],
  extra: readonly ColumnRule[] = []
): readonly ColumnRule[] {
  const rules: ColumnRule[] = [];
  for (const c of columns) {
    rules.push({ column: c.name, check: 'required', message: 'missing' });
    if (!c.nullable) {
      rules.push({ column: c.name, check: 'nonNull', message: 'is null' });
    }
    rules.push({ column: c.name, check: 'type', values: [c.type] });
  }
  return [...rules, ...extra];
}

export class RowValidator {
  private readonly rules: readonly ColumnRule[];

  constructor(rules: readonly ColumnRule[]) {
    this.rules = rules;
  }

  /** Validate a row; returns violations (empty = valid). */
  validate(row: Row): readonly Violation[] {
    const out: Violation[] = [];
    for (const r of this.rules) {
      const v = row[r.column];
      const msg = r.message ?? `failed ${r.check}`;
      switch (r.check) {
        case 'required':
          if (!(r.column in row)) out.push({ column: r.column, check: r.check, message: msg });
          break;
        case 'nonNull':
          if (r.column in row && v === null) out.push({ column: r.column, check: r.check, message: msg });
          break;
        case 'type': {
          if (v === null || v === undefined) break; // null handled by nonNull
          const want = (r.values?.[0] as string) ?? 'string';
          if (!typeMatches(v, want)) {
            out.push({ column: r.column, check: r.check, message: `expected ${want}, got ${typeof v}` });
          }
          break;
        }
        case 'range':
          if (typeof v === 'number') {
            if (r.min !== undefined && v < r.min) out.push({ column: r.column, check: r.check, message: msg });
            if (r.max !== undefined && v > r.max) out.push({ column: r.column, check: r.check, message: msg });
          }
          break;
        case 'regex':
          if (typeof v === 'string' && r.pattern && !r.pattern.test(v)) {
            out.push({ column: r.column, check: r.check, message: msg });
          }
          break;
        case 'enum':
          if (v !== undefined && v !== null && r.values && !r.values.includes(v)) {
            out.push({ column: r.column, check: r.check, message: msg });
          }
          break;
        case 'custom':
          if (r.predicate && !r.predicate(v)) {
            out.push({ column: r.column, check: r.check, message: msg });
          }
          break;
      }
    }
    return out;
  }

  /** Throw on invalid — plug into QuarantinedPipeline's processor. */
  assertValid(row: Row): Row {
    const v = this.validate(row);
    if (v.length > 0) throw new ValidationError(v);
    return row;
  }
}

function typeMatches(v: unknown, want: string): boolean {
  switch (want) {
    case 'int32':
    case 'int64':
    case 'float64':
      return typeof v === 'number' && Number.isFinite(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'string':
      return typeof v === 'string';
    case 'date':
      return typeof v === 'string' || typeof v === 'number';
    default:
      return true;
  }
}
