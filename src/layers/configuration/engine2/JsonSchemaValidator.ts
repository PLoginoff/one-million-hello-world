/**
 * Configuration Engine2 — JSON-Schema-Style Validator
 *
 * engine/ConfigSchema validates flat dot-paths with glob rules — great
 * for "every services.*.port is a number", but it cannot express nested
 * object schemas ("servers is an object whose properties are host+port
 * objects, one named 'primary' is required"). This module implements a
 * pragmatic JSON Schema subset over ConfigValue trees:
 *
 *   type, properties, required, additionalProperties (bool),
 *   items (array element schema), enum, const, pattern (RegExp on
 *   strings), min/max (numbers — or length for strings/arrays),
 *   minItems/maxItems, minProperties/maxProperties.
 *
 * Design notes:
 *   - Recursive descent produces a VIOLATION LIST, not fail-fast — a
 *     config with three broken sections reports all three.
 *   - Violation paths are dotted (servers.primary.port); array indices
 *     appear as `items[3].name`.
 *   - `additionalProperties:false` emits one violation PER unknown key
 *     so authors see the full set of drifted keys at once.
 *   - Unknown keywords are ignored (forward-compatible with real JSON
 *     Schema docs carrying descriptions, $comments etc.).
 *
 * Complexity: O(tree size × schema depth); typical config trees are
 * hundreds of nodes so this is effectively free.
 *
 * @module Configuration/Engine2
 */

import { ConfigValue, isConfigObject } from '../engine/ConfigTypes';

export interface JsonSchemaLike {
  readonly type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
  readonly properties?: Readonly<Record<string, JsonSchemaLike>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: JsonSchemaLike;
  readonly enum?: readonly ConfigValue[];
  readonly const?: ConfigValue;
  readonly pattern?: RegExp;
  readonly min?: number;
  readonly max?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly minProperties?: number;
  readonly maxProperties?: number;
}

export interface SchemaViolationV2 {
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly violations: readonly SchemaViolationV2[];
}

function typeOf(v: ConfigValue): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(actual: string, expected: string): boolean {
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function deepEq(a: ConfigValue, b: ConfigValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  }
  if (isConfigObject(a) && isConfigObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEq(a[k], b[k]));
  }
  return false;
}

export class JsonSchemaValidator {
  validate(value: ConfigValue, schema: JsonSchemaLike, basePath = ''): ValidationResult {
    const violations: SchemaViolationV2[] = [];
    this._check(value, schema, basePath, violations);
    return { valid: violations.length === 0, violations };
  }

  private _check(
    v: ConfigValue,
    s: JsonSchemaLike,
    path: string,
    out: SchemaViolationV2[]
  ): void {
    const actual = typeOf(v);

    if (s.type && !typeMatches(actual, s.type)) {
      out.push({
        path,
        keyword: 'type',
        message: `expected ${s.type}, got ${actual}`,
      });
      return; // downstream keywords assume the type — skip to cut noise
    }

    if (s.const !== undefined && !deepEq(v, s.const)) {
      out.push({ path, keyword: 'const', message: `must equal ${JSON.stringify(s.const)}` });
    }
    if (s.enum && !s.enum.some((e) => deepEq(e, v))) {
      out.push({
        path,
        keyword: 'enum',
        message: `must be one of ${s.enum.map((e) => JSON.stringify(e)).join(', ')}`,
      });
    }

    // Numeric bounds (numbers) or length bounds (strings/arrays) —
    // matches the engine's multi-arity convention.
    if (s.min !== undefined || s.max !== undefined) {
      const metric =
        actual === 'string' ? (v as string).length
        : Array.isArray(v) ? v.length
        : typeof v === 'number' ? v
        : null;
      if (metric !== null) {
        if (s.min !== undefined && metric < s.min) {
          out.push({ path, keyword: 'min', message: `${metric} < min ${s.min}` });
        }
        if (s.max !== undefined && metric > s.max) {
          out.push({ path, keyword: 'max', message: `${metric} > max ${s.max}` });
        }
      }
    }

    if (actual === 'string' && s.pattern && !s.pattern.test(v as string)) {
      out.push({ path, keyword: 'pattern', message: `does not match ${s.pattern}` });
    }

    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) {
        out.push({ path, keyword: 'minItems', message: `${v.length} items < ${s.minItems}` });
      }
      if (s.maxItems !== undefined && v.length > s.maxItems) {
        out.push({ path, keyword: 'maxItems', message: `${v.length} items > ${s.maxItems}` });
      }
      if (s.items) {
        v.forEach((item, i) => this._check(item, s.items!, `${path}[${i}]`, out));
      }
    }

    if (isConfigObject(v)) {
      const keys = Object.keys(v);
      if (s.minProperties !== undefined && keys.length < s.minProperties) {
        out.push({ path, keyword: 'minProperties', message: `${keys.length} < ${s.minProperties}` });
      }
      if (s.maxProperties !== undefined && keys.length > s.maxProperties) {
        out.push({ path, keyword: 'maxProperties', message: `${keys.length} > ${s.maxProperties}` });
      }
      const props = s.properties ?? {};
      for (const req of s.required ?? []) {
        if (!(req in v)) {
          out.push({ path, keyword: 'required', message: `missing required key '${req}'` });
        }
      }
      for (const k of keys) {
        const child = props[k];
        const childPath = path === '' ? k : `${path}.${k}`;
        if (child) {
          this._check(v[k], child, childPath, out);
        } else if (s.additionalProperties === false) {
          out.push({ path: childPath, keyword: 'additionalProperties', message: 'unexpected key' });
        }
      }
    }
  }
}
