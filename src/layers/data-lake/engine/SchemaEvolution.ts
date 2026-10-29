/**
 * Schema Evolution
 *
 * Versioned schema management with backward-compatibility checking —
 * the lake-side equivalent of a schema registry.
 *
 * Evolution rules (Avro/Parquet-style compatibility):
 *
 *   BACKWARD  — readers on the NEW schema can read data written by the
 *               OLD schema. Allowed: add nullable column, add column with
 *               default, widen int32→int64/float64, drop column (data
 *               retained, just unprojected). Forbidden: drop+re-add with
 *               different type, tighten type, rename without alias.
 *   FORWARD   — readers on the OLD schema can read NEW data. Allowed:
 *               drop column, add column only if old readers can ignore it
 *               (i.e. it's appended, not reordered).
 *   FULL      — both directions hold.
 *
 * Every schema version is recorded; the checker returns a structured
 * list of violations instead of a bare boolean so callers can surface
 * actionable errors.
 *
 * @module DataLake/Engine
 */

import { LakeColumnSchema, LakeColumnType } from './ColumnarFileFormat';

/** Compatibility mode required by the table. */
export type CompatibilityMode = 'backward' | 'forward' | 'full' | 'none';

/** A named schema change detected between two versions. */
export interface SchemaChange {
  readonly kind:
    | 'added-column'
    | 'dropped-column'
    | 'type-changed'
    | 'nullability-changed'
    | 'renamed-column'
    | 'reordered';
  readonly column: string;
  readonly detail: string;
}

/** A single compatibility violation. */
export interface CompatibilityViolation {
  readonly change: SchemaChange;
  readonly reason: string;
  readonly direction: 'backward' | 'forward';
}

/** Versioned schema entry. */
export interface SchemaVersion {
  readonly version: number;
  readonly schema: readonly LakeColumnSchema[];
  readonly registeredAt: number;
  readonly changes: readonly SchemaChange[];
}

/** Numeric-type widening lattice: each type may widen to its successors. */
const WIDENING: Record<LakeColumnType, readonly LakeColumnType[]> = {
  int32: ['int64', 'float64'],
  int64: ['float64'],
  float64: [],
  boolean: [],
  utf8: [],
};

/**
 * Diff two schemas into a list of named changes.
 * Position-sensitive: column order matters for forward-compat checks.
 */
export function diffSchemas(oldS: readonly LakeColumnSchema[], newS: readonly LakeColumnSchema[]): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const oldByName = new Map(oldS.map((c) => [c.name, c]));
  const newByName = new Map(newS.map((c) => [c.name, c]));

  for (const c of newS) {
    const prev = oldByName.get(c.name);
    if (prev === undefined) {
      changes.push({ kind: 'added-column', column: c.name, detail: `added ${c.name}: ${c.type}${c.nullable ? '?' : ''}` });
      continue;
    }
    if (prev.type !== c.type) {
      changes.push({ kind: 'type-changed', column: c.name, detail: `${prev.type} → ${c.type}` });
    }
    if (prev.nullable !== c.nullable) {
      changes.push({ kind: 'nullability-changed', column: c.name, detail: `nullable ${prev.nullable} → ${c.nullable}` });
    }
  }
  for (const c of oldS) {
    if (!newByName.has(c.name)) {
      changes.push({ kind: 'dropped-column', column: c.name, detail: `dropped ${c.name}` });
    }
  }
  // Order check on surviving columns
  const surviving = newS.filter((c) => oldByName.has(c.name));
  const oldOrder = oldS.filter((c) => newByName.has(c.name)).map((c) => c.name);
  const newOrder = surviving.map((c) => c.name);
  for (let i = 0; i < oldOrder.length; i++) {
    if (oldOrder[i] !== newOrder[i]) {
      changes.push({ kind: 'reordered', column: newOrder[i] ?? '?', detail: 'surviving column order changed' });
      break;
    }
  }
  return changes;
}

/**
 * Evaluate whether `newS` may replace `oldS` under `mode`.
 * Returns violations (empty = compatible).
 */
export function checkCompatibility(
  oldS: readonly LakeColumnSchema[],
  newS: readonly LakeColumnSchema[],
  mode: CompatibilityMode
): CompatibilityViolation[] {
  if (mode === 'none') return [];
  const changes = diffSchemas(oldS, newS);
  const violations: CompatibilityViolation[] = [];
  const checkBackward = mode === 'backward' || mode === 'full';
  const checkForward = mode === 'forward' || mode === 'full';

  for (const change of changes) {
    switch (change.kind) {
      case 'added-column': {
        const col = newS.find((c) => c.name === change.column);
        if (checkBackward && col !== undefined && !col.nullable) {
          // Old readers can't supply a value for a required new column
          // when reading old data — violates backward compat unless the
          // column is nullable (NULL default).
          violations.push({ change, reason: 'added non-nullable column breaks reading old data', direction: 'backward' });
        }
        break;
      }
      case 'dropped-column': {
        if (checkForward) {
          // Old readers still expect the column; new writers don't produce it.
          violations.push({ change, reason: 'dropped column breaks old readers on new data', direction: 'forward' });
        }
        break;
      }
      case 'type-changed': {
        const oldCol = oldS.find((c) => c.name === change.column);
        const newCol = newS.find((c) => c.name === change.column);
        if (oldCol === undefined || newCol === undefined) break;
        const widening = WIDENING[oldCol.type].includes(newCol.type);
        if (checkBackward && !widening && oldCol.type !== newCol.type) {
          violations.push({ change, reason: `non-widening type change ${oldCol.type} → ${newCol.type}`, direction: 'backward' });
        }
        if (checkForward && oldCol.type !== newCol.type) {
          // Forward compat needs exact type or a narrowing that old readers
          // tolerate — we treat any type change as forward-unsafe unless it's
          // an identity.
          violations.push({ change, reason: `type change breaks forward compat (${oldCol.type} → ${newCol.type})`, direction: 'forward' });
        }
        break;
      }
      case 'nullability-changed': {
        const oldCol = oldS.find((c) => c.name === change.column);
        const newCol = newS.find((c) => c.name === change.column);
        if (oldCol === undefined || newCol === undefined) break;
        // Making a column required (nullable→not null) breaks backward
        // compat: old data may legitimately contain NULLs.
        if (checkBackward && oldCol.nullable && !newCol.nullable) {
          violations.push({ change, reason: 'tightening nullability breaks reading old NULLs', direction: 'backward' });
        }
        break;
      }
      case 'reordered': {
        // Positional formats can't survive reorder in either direction.
        if (checkForward) {
          violations.push({ change, reason: 'column reorder breaks positional readers', direction: 'forward' });
        }
        break;
      }
      case 'renamed-column': {
        violations.push({ change, reason: 'rename without alias tracking', direction: 'backward' });
        break;
      }
    }
  }
  return violations;
}

/**
 * Schema registry for a lake table: records versioned schemas and
 * enforces the table's compatibility mode on every evolution.
 */
export class SchemaRegistry {
  private _versions: SchemaVersion[] = [];
  private _mode: CompatibilityMode;

  constructor(initial: readonly LakeColumnSchema[], mode: CompatibilityMode = 'backward') {
    this._mode = mode;
    this._versions = [{ version: 0, schema: initial, registeredAt: Date.now(), changes: [] }];
  }

  get mode(): CompatibilityMode {
    return this._mode;
  }

  setMode(mode: CompatibilityMode): void {
    this._mode = mode;
  }

  get latest(): SchemaVersion {
    return this._versions[this._versions.length - 1];
  }

  get versions(): readonly SchemaVersion[] {
    return this._versions;
  }

  versionAt(v: number): SchemaVersion | undefined {
    return this._versions.find((s) => s.version === v);
  }

  /**
   * Register an evolved schema. Throws with the full violation list
   * when incompatible under the current mode.
   */
  evolve(next: readonly LakeColumnSchema[]): SchemaVersion {
    const current = this.latest.schema;
    const violations = checkCompatibility(current, next, this._mode);
    if (violations.length > 0) {
      const msgs = violations.map((v) => `[${v.direction}] ${v.change.detail}: ${v.reason}`).join('; ');
      throw new Error(`Schema evolution rejected (${this._mode}): ${msgs}`);
    }
    const version: SchemaVersion = {
      version: this.latest.version + 1,
      schema: next,
      registeredAt: Date.now(),
      changes: diffSchemas(current, next),
    };
    this._versions.push(version);
    return version;
  }

  /**
   * Project a row written under `fromVersion` into the latest schema —
   * filling added columns with null/defaults and dropping removed ones.
   * Used when reading mixed-version data files.
   */
  projectRow(row: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
    const from = this.versionAt(fromVersion);
    if (from === undefined) throw new Error(`Unknown schema version ${fromVersion}`);
    const target = this.latest.schema;
    const out: Record<string, unknown> = {};
    for (const col of target) {
      const v = row[col.name];
      out[col.name] = v === undefined ? null : v;
    }
    return out;
  }
}
