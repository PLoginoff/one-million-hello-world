/**
 * SchemaModel — schema document validation, canonicalization,
 * fingerprinting, and structural navigation.
 *
 * Canonical form: JSON.stringify with object keys sorted recursively and
 * union type arrays sorted by their canonical string. Two schemas that
 * differ only in key/union order canonicalize identically — that is the
 * basis for dedup-on-register and content fingerprinting.
 *
 * Type promotion lattice for widening checks:
 *
 *   int -> long -> float -> double
 *   (each step is a reader-permitted promotion: a reader expecting the
 *   wider type can consume data written with the narrower)
 *
 * @module SchemaRegistry/Registry
 */

import { createHash } from 'crypto';
import { RegistryError, SchemaRegistryErrorCode } from './types';

export const PRIMITIVE_TYPES: ReadonlySet<string> = new Set([
  'null', 'boolean', 'int', 'long', 'float', 'double', 'string', 'bytes',
]);

/** Types a reader may treat as promotions (writer -> reader). */
const PROMOTION: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['int', new Set(['long', 'float', 'double'])],
  ['long', new Set(['float', 'double'])],
  ['float', new Set(['double'])],
]);

export interface FieldDef {
  name: string;
  type: unknown;
  default?: unknown;
  hasDefault: boolean;
}

export interface RecordDef {
  name: string;
  fields: FieldDef[];
}

/** Type guard: is this a plain object? */
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Canonicalize a JSON value: recursively sort object keys; union arrays
 * (arrays of type descriptors) are sorted by their canonical string so
 * ['null','string'] === ['string','null'].
 */
export function canonicalizeSchema(value: unknown): string {
  return JSON.stringify(canon(value));
}

function canon(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v.map(canon).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (isObject(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      // "fields" arrays keep declaration order — field order is
      // semantically meaningful in record encodings.
      out[k] = k === 'fields' && Array.isArray(v[k])
        ? (v[k] as unknown[]).map((f) => (isObject(f) ? canonKeepFieldOrder(f) : canon(f)))
        : canon(v[k]);
    }
    return out;
  }
  return v;
}

function canonKeepFieldOrder(field: Record<string, unknown>): unknown {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(field).sort()) {
    out[k] = k === 'type' && Array.isArray(field[k])
      ? (field[k] as unknown[]).map(canon).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : canon(field[k]);
  }
  return out;
}

/** SHA-256 fingerprint of a schema's canonical form. */
export function fingerprint(schema: unknown): string {
  return createHash('sha256').update(canonicalizeSchema(schema)).digest('hex');
}

// -------------------------------------------------------------------
// Structural navigation
// -------------------------------------------------------------------

/** Is `schema` a record-type document? */
export function isRecord(schema: unknown): schema is Record<string, unknown> {
  return isObject(schema) && schema['type'] === 'record';
}

/** Parse the fields of a record document. Throws INVALID_SCHEMA if malformed. */
export function recordFields(schema: unknown, path = ''): FieldDef[] {
  if (!isRecord(schema)) {
    throw new RegistryError(SchemaRegistryErrorCode.INVALID_SCHEMA, `expected record at ${path || 'root'}`);
  }
  const fields = schema['fields'];
  if (!Array.isArray(fields)) {
    throw new RegistryError(SchemaRegistryErrorCode.INVALID_SCHEMA, `record at ${path || 'root'} missing fields[]`);
  }
  return fields.map((f, i) => {
    if (!isObject(f) || typeof f['name'] !== 'string' || f['type'] === undefined) {
      throw new RegistryError(
        SchemaRegistryErrorCode.INVALID_SCHEMA,
        `malformed field #${i} at ${path || 'root'}`
      );
    }
    return {
      name: f['name'],
      type: f['type'],
      default: f['default'],
      hasDefault: Object.prototype.hasOwnProperty.call(f, 'default'),
    };
  });
}

/** Validate a schema document recursively (types known, unions non-empty). */
export function validateSchema(schema: unknown, path = '', seen?: Set<string>): void {
  const names = seen ?? new Set<string>();
  const check = (t: unknown, p: string): void => {
    if (typeof t === 'string') {
      if (!PRIMITIVE_TYPES.has(t) && !names.has(t)) {
        // Named type reference — allowed if it looks like an identifier
        if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(t)) {
          throw new RegistryError(SchemaRegistryErrorCode.INVALID_SCHEMA, `invalid type name '${t}' at ${p}`);
        }
      }
      return;
    }
    if (Array.isArray(t)) {
      if (t.length === 0) {
        throw new RegistryError(SchemaRegistryErrorCode.INVALID_SCHEMA, `empty union at ${p}`);
      }
      t.forEach((x, i) => check(x, `${p}[${i}]`));
      return;
    }
    if (isObject(t)) {
      const ty = t['type'];
      if (ty === 'record') {
        if (typeof t['name'] !== 'string') {
          throw new RegistryError(SchemaRegistryErrorCode.INVALID_SCHEMA, `record at ${p} missing name`);
        }
        names.add(t['name'] as string);
        recordFields(t, p).forEach((f) => check(f.type, `${p}.${f.name}`));
        return;
      }
      if (ty === 'array') {
        check(t['items'], `${p}[]`);
        return;
      }
      if (ty === 'map') {
        check(t['values'], `${p}{}`);
        return;
      }
      if (ty === 'enum') {
        if (!Array.isArray(t['symbols']) || (t['symbols'] as unknown[]).some((s) => typeof s !== 'string')) {
          throw new RegistryError(SchemaRegistryErrorCode.INVALID_SCHEMA, `enum at ${p} needs string symbols[]`);
        }
        return;
      }
      if (typeof ty === 'string' && PRIMITIVE_TYPES.has(ty)) return;
      throw new RegistryError(SchemaRegistryErrorCode.INVALID_SCHEMA, `unsupported type at ${p}`);
    }
    throw new RegistryError(SchemaRegistryErrorCode.INVALID_SCHEMA, `invalid type descriptor at ${p}`);
  };
  check(schema, path || 'root');
}

/**
 * Can a reader expecting `readerType` consume data written with
 * `writerType`? Covers primitives, promotions, unions, records
 * (field-wise via callback), arrays, maps, enums.
 *
 * `recordComparator` is injected by the caller to handle nested records
 * (it carries direction context); primitive/union logic is local.
 */
export function typeCompatible(
  writer: unknown,
  reader: unknown,
  allowWidening: boolean,
  recordComparator: (w: Record<string, unknown>, r: Record<string, unknown>) => boolean
): boolean {
  // Normalize unions
  const wUnion = Array.isArray(writer) ? writer : [writer];
  const rUnion = Array.isArray(reader) ? reader : [reader];

  // Every writer branch must be readable by at least one reader branch.
  return wUnion.every((w) => rUnion.some((r) => singleTypeCompatible(w, r, allowWidening, recordComparator)));
}

function singleTypeCompatible(
  writer: unknown,
  reader: unknown,
  allowWidening: boolean,
  recordComparator: (w: Record<string, unknown>, r: Record<string, unknown>) => boolean
): boolean {
  const wName = typeName(writer);
  const rName = typeName(reader);
  if (wName !== null && rName !== null) {
    if (wName === rName) return true;
    if (allowWidening && PROMOTION.get(wName)?.has(rName)) return true;
    // Named-type equality: same identifier
    if (!PRIMITIVE_TYPES.has(wName) && wName === rName) return true;
    return false;
  }
  if (isObject(writer) && isObject(reader)) {
    if (writer['type'] === 'record' && reader['type'] === 'record') {
      return recordComparator(writer, reader);
    }
    if (writer['type'] === 'array' && reader['type'] === 'array') {
      return typeCompatible(writer['items'], reader['items'], allowWidening, recordComparator);
    }
    if (writer['type'] === 'map' && reader['type'] === 'map') {
      return typeCompatible(writer['values'], reader['values'], allowWidening, recordComparator);
    }
    if (writer['type'] === 'enum' && reader['type'] === 'enum') {
      const wSymbols = new Set(writer['symbols'] as string[]);
      const rSymbols = new Set(reader['symbols'] as string[]);
      // Reader enum must cover all writer symbols
      return [...wSymbols].every((s) => rSymbols.has(s));
    }
    if (writer['type'] === reader['type'] && PRIMITIVE_TYPES.has(writer['type'] as string)) return true;
    return false;
  }
  return false;
}

function typeName(t: unknown): string | null {
  if (typeof t === 'string') return t;
  if (isObject(t) && typeof t['type'] === 'string' && PRIMITIVE_TYPES.has(t['type'])) {
    return t['type'];
  }
  return null;
}
