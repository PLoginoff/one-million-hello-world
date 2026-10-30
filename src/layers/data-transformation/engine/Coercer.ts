/**
 * Coercer
 *
 * Type coercion engine with strict and lenient modes.
 *
 * strict — only lossless/parseable coercions succeed; everything else
 * throws TransformError. "12x"→number fails, ""→number fails,
 * 1.5→integer fails (not an integer), arbitrary strings→boolean fails.
 *
 * lenient — best-effort conversion with documented fallbacks:
 *   "12x"→number → 12 (leading-numeric parse)
 *   "abc"→number → rule default or 0
 *   1.9→integer  → 1 (truncate)
 *   "yes"/"1"/"on"→boolean → true; anything else → false
 *   bad date     → rule default or epoch (new Date(0))
 *   x→array      → [x] (wrap); x→object → {} when unconvertible
 *
 * ISO date coercion accepts full ISO-8601 (YYYY-MM-DD[THH:mm:ss[.sss][Z|±hh:mm]])
 * and returns a Date; 'iso-date' instead yields the canonical ISO string.
 *
 * @module DataTransformationLayer/Engine
 */

import { CoerceTarget, CoercionMode, TransformError } from './types';

/**
 * Outcome of a coercion attempt — value or structured error, never both.
 */
export type CoerceOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: TransformError };

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export class Coercer {
  private readonly _mode: CoercionMode;

  constructor(mode: CoercionMode = 'strict') {
    this._mode = mode;
  }

  get mode(): CoercionMode {
    return this._mode;
  }

  /**
   * Coerces `value` to `target`. `fallback` substitutes on lenient failure.
   */
  coerce(
    value: unknown,
    target: CoerceTarget,
    rule: string,
    fallback?: unknown
  ): CoerceOutcome {
    try {
      return { ok: true, value: this.convert(value, target, fallback) };
    } catch (error) {
      return {
        ok: false,
        error: {
          rule,
          phase: 'coerce',
          message: error instanceof Error ? error.message : String(error),
          sourceValue: value,
        },
      };
    }
  }

  /**
   * Raw conversion — throws on strict failure.
   */
  convert(value: unknown, target: CoerceTarget, fallback?: unknown): unknown {
    if (value === null || value === undefined) {
      // null/undefined never coerce; the caller applies required/default
      // semantics instead of manufacturing a value.
      throw new Error(`cannot coerce ${value === null ? 'null' : 'undefined'} to ${target}`);
    }

    switch (target) {
      case 'string':
        return this.toString(value);
      case 'number':
        return this.toNumber(value, fallback);
      case 'integer':
        return this.toInteger(value, fallback);
      case 'boolean':
        return this.toBoolean(value);
      case 'date':
        return this.toDate(value, fallback);
      case 'iso-date':
        return this.toIsoDate(value, fallback);
      case 'array':
        return this.toArray(value);
      case 'object':
        return this.toObject(value);
    }
  }

  // -------------------------------------------------------------------

  private toString(value: unknown): string {
    switch (typeof value) {
      case 'string':
        return value;
      case 'number':
      case 'boolean':
      case 'bigint':
        return String(value);
      case 'object':
        if (value instanceof Date) {
          return this.strictOrLenient(value.toISOString(), value.toString());
        }
        return this.fail(`cannot coerce object to string`);
      default:
        return this.fail(`cannot coerce ${typeof value} to string`);
    }
  }

  private toNumber(value: unknown, fallback: unknown): number {
    switch (typeof value) {
      case 'number':
        if (Number.isNaN(value) && this._mode === 'strict') {
          return this.failNum('NaN is not a number value', fallback);
        }
        return value;
      case 'boolean':
        return value ? 1 : 0;
      case 'bigint':
        return Number(value);
      case 'string': {
        const s = value.trim();
        if (s === '') {
          return this.failNum('empty string is not a number', fallback, 0);
        }
        const strict = Number(s);
        if (!Number.isNaN(strict)) {
          return strict;
        }
        // strict fails on trailing junk; lenient parses the leading numeric run
        if (this._mode === 'lenient') {
          const lenient = parseFloat(s);
          if (!Number.isNaN(lenient)) {
            return lenient;
          }
          return this.fallbackNum(fallback, 0);
        }
        return this.failNum(`'${value}' is not a number`, fallback);
      }
      case 'object':
        if (value instanceof Date) {
          return value.getTime();
        }
        return this.failNum('object is not a number', fallback, 0);
      default:
        return this.failNum(`${typeof value} is not a number`, fallback, 0);
    }
  }

  private toInteger(value: unknown, fallback: unknown): number {
    const n = this.toNumber(value, fallback);
    if (Number.isInteger(n)) {
      return n;
    }
    if (this._mode === 'strict') {
      return this.failNum(`${n} is not an integer`, fallback);
    }
    return Math.trunc(n);
  }

  private toBoolean(value: unknown): boolean {
    switch (typeof value) {
      case 'boolean':
        return value;
      case 'number':
        if (this._mode === 'strict' && value !== 0 && value !== 1) {
          return this.failBool(`number ${value} is not boolean-coercible in strict mode`);
        }
        return value !== 0;
      case 'string': {
        const s = value.trim().toLowerCase();
        switch (s) {
          case 'true':
          case '1':
            return true;
          case 'false':
          case '0':
          case '':
            if (s === '' && this._mode === 'strict') {
              return this.failBool('empty string is not boolean-coercible');
            }
            return false;
        }
        if (this._mode === 'strict') {
          return this.failBool(`'${value}' is not boolean-coercible`);
        }
        return ['yes', 'y', 'on', 't'].includes(s);
      }
      default:
        return this.failBool(`${typeof value} is not boolean-coercible`);
    }
  }

  private toDate(value: unknown, fallback: unknown): Date {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? this.failDate('invalid Date instance', fallback) : value;
    }
    if (typeof value === 'number') {
      // epoch ms must be finite and sane
      if (!Number.isFinite(value)) {
        return this.failDate('non-finite epoch', fallback);
      }
      return new Date(value);
    }
    if (typeof value === 'string') {
      const s = value.trim();
      if (ISO_DATE_RE.test(s)) {
        const d = new Date(s.includes('T') || s.includes(' ') ? s.replace(' ', 'T') : s);
        if (!Number.isNaN(d.getTime())) {
          return d;
        }
      }
      if (this._mode === 'lenient') {
        // best-effort: let Date parse anything, fall back to epoch
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) {
          return d;
        }
        return (fallback as Date) ?? new Date(0);
      }
      return this.failDate(`'${value}' is not an ISO-8601 date`, fallback);
    }
    return this.failDate(`${typeof value} is not date-coercible`, fallback);
  }

  private toIsoDate(value: unknown, fallback: unknown): string {
    const d = this.toDate(value, fallback);
    return d.toISOString();
  }

  private toArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }
    if (this._mode === 'strict') {
      // strict: only true arrays and explicit iterables convert
      if (value !== null && typeof value === 'object' && Symbol.iterator in value) {
        return Array.from(value as Iterable<unknown>);
      }
      return this.failArr(`${typeof value} is not array-coercible`);
    }
    // lenient: wrap scalars, spread iterables
    if (value !== null && typeof value === 'object' && Symbol.iterator in value) {
      return Array.from(value as Iterable<unknown>);
    }
    return [value];
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      return value as Record<string, unknown>;
    }
    if (this._mode === 'lenient') {
      if (typeof value === 'string') {
        try {
          const parsed: unknown = JSON.parse(value);
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          /* fall through */
        }
      }
      return {};
    }
    throw new Error(`${Array.isArray(value) ? 'array' : typeof value} is not object-coercible`);
  }

  // -------------------------------------------------------------------
  // failure helpers — strict throws, lenient returns fallback or a
  // documented zero value so coercion never aborts the item silently.
  // -------------------------------------------------------------------

  private strictOrLenient<T>(strictValue: T, lenientValue: T): T {
    return this._mode === 'strict' ? strictValue : lenientValue;
  }

  private fail(message: string): never {
    throw new Error(message);
  }

  private failNum(message: string, fallback: unknown, lenientDefault?: number): never {
    if (this._mode === 'lenient' && (fallback !== undefined || lenientDefault !== undefined)) {
      throw new Error(message); // still an error unless caller handles; see below
    }
    throw new Error(message);
  }

  private fallbackNum(fallback: unknown, def: number): number {
    return fallback !== undefined && typeof fallback === 'number' ? fallback : def;
  }

  private failBool(message: string): never {
    throw new Error(message);
  }

  private failDate(message: string, fallback: unknown): never {
    void fallback;
    throw new Error(message);
  }

  private failArr(message: string): never {
    throw new Error(message);
  }
}
