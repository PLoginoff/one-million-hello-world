/**
 * DataValidator — validate JSON payloads against record schemas.
 *
 * Performs structural validation so producers can check a document
 * conforms before publishing under a schema:
 *
 *  - Required fields (no default) must be present
 *  - Primitive type checks: null/boolean/int/long/float/double/
 *    string/bytes. int/long require integral numbers; long is checked
 *    against the IEEE-754 safe-integer range.
 *  - Union: value must match at least one branch
 *  - record: recursive field validation
 *  - array/map: homogeneous element validation
 *  - enum: value must be a declared symbol
 *
 * Returns a list of violations with dotted paths — never throws on bad
 * data; only malformed schemas raise RegistryError.
 *
 * @module SchemaRegistry/Registry
 */

import { isObject, recordFields, PRIMITIVE_TYPES } from './SchemaModel';

export interface ValidationIssue {
  path: string;
  expected: string;
  actual: string;
  message: string;
}

/** Type description for error messages. */
function describe(t: unknown): string {
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return `union[${t.map(describe).join('|')}]`;
  if (isObject(t)) return String(t['type']);
  return String(t);
}

function actualOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
  return typeof v;
}

export class DataValidator {
  /**
   * Validate `value` against `schema`. Returns [] when valid.
   * `path` prefixes nested issue paths (recursion internal).
   */
  validate(schema: unknown, value: unknown, path = ''): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    this._check(schema, value, path || '$', issues);
    return issues;
  }

  private _check(schema: unknown, value: unknown, path: string, issues: ValidationIssue[]): void {
    if (typeof schema === 'string') {
      this._checkPrimitive(schema, value, path, issues);
      return;
    }
    if (Array.isArray(schema)) {
      // union: match if any branch validates cleanly
      const sub = schema.map((branch) => {
        const tmp: ValidationIssue[] = [];
        this._check(branch, value, path, tmp);
        return tmp.length;
      });
      if (!sub.some((n) => n === 0)) {
        issues.push({ path, expected: describe(schema), actual: actualOf(value), message: 'value matches no union branch' });
      }
      return;
    }
    if (isObject(schema)) {
      const t = schema['type'];
      if (t === 'record') {
        if (!isObject(value)) {
          issues.push({ path, expected: 'record', actual: actualOf(value), message: 'expected object' });
          return;
        }
        for (const f of recordFields(schema, path)) {
          const p = `${path}.${f.name}`;
          const present = Object.prototype.hasOwnProperty.call(value, f.name);
          if (!present) {
            if (!f.hasDefault) {
              issues.push({ path: p, expected: describe(f.type), actual: 'absent', message: 'required field missing' });
            }
            continue;
          }
          this._check(f.type, (value as Record<string, unknown>)[f.name], p, issues);
        }
        return;
      }
      if (t === 'array') {
        if (!Array.isArray(value)) {
          issues.push({ path, expected: 'array', actual: actualOf(value), message: 'expected array' });
          return;
        }
        value.forEach((el, i) => this._check(schema['items'], el, `${path}[${i}]`, issues));
        return;
      }
      if (t === 'map') {
        if (!isObject(value)) {
          issues.push({ path, expected: 'map', actual: actualOf(value), message: 'expected object (map)' });
          return;
        }
        for (const [k, v] of Object.entries(value)) {
          this._check(schema['values'], v, `${path}{${k}}`, issues);
        }
        return;
      }
      if (t === 'enum') {
        const symbols = new Set(schema['symbols'] as string[]);
        if (typeof value !== 'string' || !symbols.has(value)) {
          issues.push({ path, expected: `enum{${[...symbols].join(',')}}`, actual: actualOf(value), message: 'not a declared enum symbol' });
        }
        return;
      }
      if (typeof t === 'string' && PRIMITIVE_TYPES.has(t)) {
        this._checkPrimitive(t, value, path, issues);
        return;
      }
      issues.push({ path, expected: describe(schema), actual: actualOf(value), message: 'unsupported schema node' });
      return;
    }
    issues.push({ path, expected: describe(schema), actual: actualOf(value), message: 'invalid schema node' });
  }

  private _checkPrimitive(t: string, value: unknown, path: string, issues: ValidationIssue[]): void {
    const fail = (): void => {
      issues.push({ path, expected: t, actual: actualOf(value), message: `expected ${t}` });
    };
    switch (t) {
      case 'null': if (value !== null) fail(); break;
      case 'boolean': if (typeof value !== 'boolean') fail(); break;
      case 'int':
        if (typeof value !== 'number' || !Number.isInteger(value) || Math.abs(value) > 2_147_483_647) fail();
        break;
      case 'long':
        if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isSafeInteger(value)) fail();
        break;
      case 'float':
      case 'double':
        if (typeof value !== 'number') fail();
        break;
      case 'string': if (typeof value !== 'string') fail(); break;
      case 'bytes':
        if (!(typeof value === 'string' || value instanceof Uint8Array)) fail();
        break;
      default:
        // Named-type reference — can't validate without resolution;
        // accept structurally if it looks plausible (object).
        break;
    }
  }
}
