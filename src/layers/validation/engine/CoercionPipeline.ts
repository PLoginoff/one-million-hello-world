/**
 * CoercionPipeline — ordered string→typed conversion with strict
 * mode.
 *
 * The pipeline is a list of typed steps, each `(value) → result`.
 * Steps run in order and the first success wins; a step may decline
 * (`ok: false`) and the next runs. That ordering is the design —
 * coercion must be *predictable*: 'true' must become boolean before
 * it tries number (where it would fail anyway), and ISO dates must
 * try Date before anything lossy.
 *
 * Strict vs loose:
 *  - strict: the input must be an exact representation — '42' → 42,
 *    but '4.2' does NOT become integer 4, 'yes' does NOT become
 *    boolean true. Integer coercion requires `/^-?\d+$/`; boolean
 *    only accepts true/false/1/0/on/off (case-insensitive); numbers
 *    require parse + isFinite + no leftover.
 *  - loose: `Number(v)` semantics, truthy/falsy strings accepted,
 *    `Date.parse` best-effort.
 *
 * Strict mode exists because coercion is a *silent data-mutation*
 * step: a pipeline that coerces '4.2' → 4 silently changed the
 * user's data. Strict refuses to guess.
 *
 * `emptyStringAsAbsent` is the form-posting convention: an empty
 * input field means "not provided", so '' should coerce to absent
 * (undefined) rather than fail — otherwise every optional field in a
 * form submission is a validation error.
 *
 * Complexity: O(steps) per value; each step is O(1) or O(n) in the
 * string length.
 *
 * @module ValidationLayer/Engine
 */

import { CoercionOptions, CoercionResult, FieldKind } from './types';

/** Coerce a single value to `kind` under `options`. */
export class CoercionPipeline {
  private readonly _strict: boolean;
  private readonly _emptyAsAbsent: boolean;

  constructor(options: CoercionOptions = {}) {
    this._strict = options.strict ?? false;
    this._emptyAsAbsent = options.emptyStringAsAbsent ?? true;
  }

  get strict(): boolean {
    return this._strict;
  }

  /**
   * Coerce `value` to `kind`. Returns `{ok, value}` — `ok: false`
   * carries `reason` for the error message.
   */
  coerce(value: unknown, kind: FieldKind): CoercionResult {
    // Pass-through: already the right type (or untyped).
    if (value === undefined || value === null) {
      return { ok: true, value };
    }
    if (this._emptyAsAbsent && typeof value === 'string' && value === '') {
      return { ok: true, value: undefined };
    }

    switch (kind) {
      case FieldKind.STRING:
        return this._toString(value);
      case FieldKind.NUMBER:
        return this._toNumber(value);
      case FieldKind.INTEGER:
        return this._toInteger(value);
      case FieldKind.BOOLEAN:
        return this._toBoolean(value);
      case FieldKind.DATE:
        return this._toDate(value);
      case FieldKind.ARRAY:
        return this._toArray(value);
      case FieldKind.OBJECT:
        return this._toObject(value);
      case FieldKind.ENUM:
      case FieldKind.ANY:
        return { ok: true, value };
    }
  }

  /* ---------------------------------------------------------------- */
  /* Per-kind steps                                                    */
  /* ---------------------------------------------------------------- */

  private _toString(v: unknown): CoercionResult {
    if (typeof v === 'string') {
      return { ok: true, value: v };
    }
    if (this._strict) {
      return { ok: false, reason: `strict: ${typeof v} is not a string` };
    }
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') {
      return { ok: true, value: String(v) };
    }
    return { ok: false, reason: `cannot coerce ${typeof v} to string` };
  }

  private _toNumber(v: unknown): CoercionResult {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return { ok: true, value: v };
    }
    if (typeof v === 'string') {
      const s = v.trim();
      if (s === '') {
        return { ok: false, reason: 'empty string is not a number' };
      }
      const n = Number(s);
      if (Number.isNaN(n)) {
        return { ok: false, reason: `'${s}' is not numeric` };
      }
      if (this._strict && !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) {
        return { ok: false, reason: `strict: '${s}' is not an exact number` };
      }
      if (!Number.isFinite(n)) {
        return { ok: false, reason: `'${s}' is not finite` };
      }
      return { ok: true, value: n };
    }
    if (typeof v === 'boolean' && !this._strict) {
      return { ok: true, value: v ? 1 : 0 };
    }
    if (v instanceof Date) {
      return { ok: true, value: v.getTime() };
    }
    return { ok: false, reason: `cannot coerce ${typeof v} to number` };
  }

  private _toInteger(v: unknown): CoercionResult {
    if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        return { ok: true, value: v };
      }
      if (this._strict) {
        return { ok: false, reason: `strict: ${v} is not an integer` };
      }
      return { ok: true, value: Math.trunc(v) };
    }
    if (typeof v === 'string') {
      const s = v.trim();
      if (this._strict && !/^[-+]?\d+$/.test(s)) {
        return { ok: false, reason: `strict: '${s}' is not an integer literal` };
      }
      const n = Number(s);
      if (Number.isNaN(n)) {
        return { ok: false, reason: `'${s}' is not numeric` };
      }
      const t = Math.trunc(n);
      if (this._strict && t !== n) {
        return { ok: false, reason: `strict: '${s}' truncates` };
      }
      return { ok: true, value: t };
    }
    return { ok: false, reason: `cannot coerce ${typeof v} to integer` };
  }

  private _toBoolean(v: unknown): CoercionResult {
    if (typeof v === 'boolean') {
      return { ok: true, value: v };
    }
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      const trues = new Set(['true', '1', 'yes', 'on']);
      const falses = new Set(['false', '0', 'no', 'off']);
      if (this._strict) {
        // Strict: only the canonical spellings.
        if (s === 'true' || s === '1') return { ok: true, value: true };
        if (s === 'false' || s === '0') return { ok: true, value: false };
        return { ok: false, reason: `strict: '${v}' is not a boolean` };
      }
      if (trues.has(s)) return { ok: true, value: true };
      if (falses.has(s)) return { ok: true, value: false };
      return { ok: false, reason: `'${v}' is not a boolean` };
    }
    if (typeof v === 'number' && !this._strict) {
      return { ok: true, value: v !== 0 };
    }
    return { ok: false, reason: `cannot coerce ${typeof v} to boolean` };
  }

  private _toDate(v: unknown): CoercionResult {
    if (v instanceof Date) {
      return { ok: true, value: v };
    }
    if (typeof v === 'string') {
      const s = v.trim();
      // Strict: ISO-8601 only — anything else is a guess.
      if (this._strict && !/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[-+]\d{2}:?\d{2})?)?$/.test(s)) {
        return { ok: false, reason: `strict: '${s}' is not ISO-8601` };
      }
      const t = Date.parse(s);
      if (Number.isNaN(t)) {
        return { ok: false, reason: `'${s}' is not a date` };
      }
      return { ok: true, value: new Date(t) };
    }
    if (typeof v === 'number' && !this._strict) {
      return { ok: true, value: new Date(v) };
    }
    return { ok: false, reason: `cannot coerce ${typeof v} to date` };
  }

  private _toArray(v: unknown): CoercionResult {
    if (Array.isArray(v)) {
      return { ok: true, value: v };
    }
    if (this._strict) {
      return { ok: false, reason: `strict: ${typeof v} is not an array` };
    }
    // Loose: a single non-array value wraps to a 1-element array
    // (form posts submit a scalar for a single checkbox).
    return { ok: true, value: [v] };
  }

  private _toObject(v: unknown): CoercionResult {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      return { ok: true, value: v };
    }
    if (typeof v === 'string' && !this._strict) {
      try {
        const parsed = JSON.parse(v) as unknown;
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return { ok: true, value: parsed };
        }
      } catch {
        /* fall through */
      }
    }
    return { ok: false, reason: `cannot coerce ${typeof v} to object` };
  }
}
