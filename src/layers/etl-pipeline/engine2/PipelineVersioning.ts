/**
 * Pipeline Versioning — schema evolution between runs.
 *
 * A pipeline's output schema evolves (columns added, types widened,
 * renames). This module tracks versions and validates that a new
 * pipeline version's schema is a legal evolution of the prior one —
 * preventing silent data corruption on upgrade.
 *
 * Compatibility rules (configurable strictness):
 *   - BACKWARD: new schema can read data written by the old one —
 *     columns may be added (with defaults) or widened, not removed or
 *     narrowed.
 *   - FORWARD: old readers must tolerate new data — columns may be
 *     removed or added-but-optional.
 *   - FULL: both.
 *   - NONE: anything goes (tracked only).
 *
 * Type widening lattice: int32 → int64 → float64 → string;
 * date → string. Everything else = incompatible type change.
 *
 * @module EtlPipeline/Engine2
 */

import { Scalar } from '../../data-warehouse/engine/ColumnStorageEngine';

export type SchemaColumnType =
  | 'int32'
  | 'int64'
  | 'float64'
  | 'boolean'
  | 'string'
  | 'date';

export interface SchemaColumn {
  readonly name: string;
  readonly type: SchemaColumnType;
  readonly nullable: boolean;
  /** Default used when a new column meets old data (backward compat). */
  readonly defaultValue?: Scalar;
}

export interface PipelineSchema {
  readonly version: number;
  readonly columns: readonly SchemaColumn[];
}

export type CompatibilityMode = 'backward' | 'forward' | 'full' | 'none';

interface TypeChange {
  column: string;
  from: SchemaColumnType;
  to: SchemaColumnType;
  widening: boolean;
}

interface NullabilityChange {
  column: string;
  from: boolean;
  to: boolean;
}

export interface SchemaDiff {
  readonly added: readonly SchemaColumn[];
  readonly removed: readonly SchemaColumn[];
  readonly typeChanges: readonly TypeChange[];
  readonly nullabilityChanges: readonly NullabilityChange[];
  readonly compatible: boolean;
  readonly violations: readonly string[];
}

const WIDENING: Record<SchemaColumnType, readonly SchemaColumnType[]> = {
  int32: ['int64', 'float64', 'string'],
  int64: ['float64', 'string'],
  float64: ['string'],
  boolean: ['string'],
  string: [],
  date: ['string'],
};

/** Diff two schema versions under a compatibility mode. */
export function diffSchemas(
  from: PipelineSchema,
  to: PipelineSchema,
  mode: CompatibilityMode
): SchemaDiff {
  const f = new Map(from.columns.map((c) => [c.name, c]));
  const t = new Map(to.columns.map((c) => [c.name, c]));

  const added: SchemaColumn[] = [];
  const removed: SchemaColumn[] = [];
  const typeChanges: TypeChange[] = [];
  const nullChanges: NullabilityChange[] = [];
  const violations: string[] = [];

  for (const [name, tc] of t) {
    const fc = f.get(name);
    if (!fc) {
      added.push(tc);
      if (mode !== 'none' && mode !== 'forward') {
        if (tc.defaultValue === undefined && !tc.nullable) {
          violations.push(`column '${name}' added without default and not nullable — old rows can't supply it`);
        }
      }
      continue;
    }
    if (fc.type !== tc.type) {
      const widening = WIDENING[fc.type].includes(tc.type);
      typeChanges.push({ column: name, from: fc.type, to: tc.type, widening });
      if (mode !== 'none' && !widening) {
        violations.push(`column '${name}' narrowed ${fc.type} → ${tc.type}`);
      }
    }
    if (fc.nullable !== tc.nullable) {
      nullChanges.push({ column: name, from: fc.nullable, to: tc.nullable });
      if (mode !== 'none' && fc.nullable && !tc.nullable) {
        violations.push(`column '${name}' tightened to non-nullable — old data may contain nulls`);
      }
    }
  }
  for (const name of f.keys()) {
    if (!t.has(name)) {
      removed.push(f.get(name)!);
      if (mode === 'backward' || mode === 'full') {
        violations.push(`column '${name}' removed — old readers break`);
      }
    }
  }
  return { added, removed, typeChanges, nullabilityChanges: nullChanges, compatible: violations.length === 0, violations };
}

/** Versioned pipeline registry — records schemas, validates upgrades. */
export class PipelineVersionRegistry {
  private readonly history = new Map<string, PipelineSchema[]>(); // pipelineId → versions
  private readonly mode: CompatibilityMode;

  constructor(mode: CompatibilityMode = 'backward') {
    this.mode = mode;
  }

  /** Register a new schema version; returns the diff against the prior. */
  register(pipelineId: string, schema: PipelineSchema): SchemaDiff | null {
    const h = this.history.get(pipelineId) ?? [];
    const prior = h[h.length - 1];
    const diff = prior ? diffSchemas(prior, schema, this.mode) : null;
    if (prior && diff && !diff.compatible) {
      return diff; // violations — caller decides whether to register anyway
    }
    h.push(schema);
    this.history.set(pipelineId, h);
    return diff;
  }

  /** Force-register a schema even with violations (documented override). */
  registerOverride(pipelineId: string, schema: PipelineSchema): void {
    const h = this.history.get(pipelineId) ?? [];
    h.push(schema);
    this.history.set(pipelineId, h);
  }

  versions(pipelineId: string): readonly PipelineSchema[] {
    return this.history.get(pipelineId)?.slice() ?? [];
  }

  latest(pipelineId: string): PipelineSchema | undefined {
    const h = this.history.get(pipelineId);
    return h?.[h.length - 1];
  }

  /** Migrate a row written under `from` schema to `to` schema. */
  migrate(row: Record<string, Scalar>, from: PipelineSchema, to: PipelineSchema): Record<string, Scalar> {
    const t = new Map(to.columns.map((c) => [c.name, c]));
    const out: Record<string, Scalar> = {};
    for (const [k, v] of Object.entries(row)) {
      if (t.has(k)) out[k] = v; // keep surviving columns
    }
    // Fill added columns with defaults.
    for (const c of to.columns) {
      if (!(c.name in out) && c.defaultValue !== undefined) {
        out[c.name] = c.defaultValue;
      } else if (!(c.name in out) && c.nullable) {
        out[c.name] = null;
      }
    }
    return out;
  }
}
