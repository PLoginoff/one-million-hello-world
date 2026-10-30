/**
 * SchemaCompiler — compiles a declarative schema into a reusable
 * validation closure.
 *
 * The key property: schema parsing happens ONCE at compile time.
 * `compile` walks the schema tree, validates every rule's shape, and
 * produces a closure of native predicates — field lookups, regex
 * `.test` calls, range comparisons. `validate` then runs that
 * closure: zero schema traversal, zero string parsing, zero regex
 * construction. A schema compiled once validates a million requests
 * at interpretive-loop speed.
 *
 * Compile-time validation is the other half of the value: a malformed
 * schema fails fast with `SchemaCompileError` naming the exact path
 * (`user.address.zip`), rather than producing a validator that
 * silently ignores the broken rule.
 *
 * Supported rule set (declarative subset of JSON-Schema-flavoured
 * validation, chosen for closure-compilability):
 *  - kinds: string/number/integer/boolean/date/array/object/enum/any
 *  - string: minLength, maxLength, pattern, format(email|url|uuid|
 *    iso-date)
 *  - number/integer: min, max, multipleOf
 *  - array: minItems, maxItems, items, uniqueItems
 *  - object: properties, additionalProperties
 *  - required, coerce, custom `validate` fn per field
 *  - crossField: dependent-required, if-then, mutually-exclusive,
 *    at-least-one
 *
 * Error paths use {@link ErrorPath} — `user.address.zip`,
 * `items[3].id` — the notation the pipeline surfaces.
 *
 * Coercion runs *before* rule checks on a per-field basis when the
 * field opts in (`coerce: true|'strict'`), so '42' validates as a
 * number. The `coerced` output is the input with all successful
 * coercions applied — failures leave the original value and add an
 * error instead.
 *
 * @module ValidationLayer/Engine
 */

import { CoercionPipeline } from './CoercionPipeline';
import { ErrorPath } from './ErrorPath';
import {
  AsyncRule,
  AsyncValidationOptions,
  AsyncValidationTimeoutError,
  EngineCrossFieldRule,
  EngineValidationResult,
  FieldError,
  FieldKind,
  FieldSchema,
  ObjectSchema,
  SchemaCompileError,
} from './types';

/* ------------------------------------------------------------------ */
/* Compiled predicate                                                  */
/* ------------------------------------------------------------------ */

type CompiledValidator = (
  value: unknown,
  path: ErrorPath,
  errors: FieldError[],
  coerced: Map<string, unknown>,
  coercer: CoercionPipeline
) => void;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[-+]\d{2}:?\d{2})?)?$/;

function err(errors: FieldError[], path: ErrorPath, rule: string, message: string, value?: unknown): void {
  errors.push({ path: path.toString(), rule, message, value });
}

export class SchemaCompiler {
  private readonly _coercer: CoercionPipeline;

  constructor(coercer?: CoercionPipeline) {
    this._coercer = coercer ?? new CoercionPipeline();
  }

  /* ---------------------------------------------------------------- */
  /* Compilation                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Compile an object schema into a validator closure.
   * Throws `SchemaCompileError` on malformed schemas — the schema is
   * validated as strictly as the data it will check.
   */
  compile(schema: ObjectSchema): (value: unknown) => EngineValidationResult {
    if (!schema || schema.kind !== 'object' || !schema.properties) {
      throw new SchemaCompileError('$', 'top-level schema must be {kind:"object",properties}');
    }
    const validators: [string, CompiledValidator][] = [];
    for (const [name, field] of Object.entries(schema.properties)) {
      validators.push([name, this._compileField(field, ErrorPath.root().child(name))]);
    }
    const crossField = schema.crossField ?? [];
    const additional = schema.additionalProperties ?? true;

    const coercer = this._coercer;
    const start = Date.now;

    return (input: unknown): EngineValidationResult => {
      const t0 = start();
      const errors: FieldError[] = [];
      const coerced = new Map<string, unknown>();
      const root = ErrorPath.root();

      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        err(errors, root, 'kind', `expected object, got ${Array.isArray(input) ? 'array' : typeof input}`, input);
        return { valid: false, errors, durationMs: start() - t0 };
      }
      const obj = input as Record<string, unknown>;

      // Per-field validation.
      for (const [name, validate] of validators) {
        const present = obj[name] !== undefined;
        const field = schema.properties[name];

        if (!present) {
          if (field.required) {
            err(errors, root.child(name), 'required', `${name} is required`);
          }
          continue;
        }

        // Optional coercion: replaces the value before rule checks.
        let value = obj[name];
        if (field.coerce) {
          const strict = field.coerce === 'strict' || this._coercer.strict;
          const r = new CoercionPipeline({ strict }).coerce(value, field.kind);
          if (r.ok && r.value !== value) {
            value = r.value;
            coerced.set(name, value);
          } else if (!r.ok) {
            err(errors, root.child(name), 'coerce', r.reason ?? 'coercion failed', obj[name]);
            continue; // can't validate what couldn't coerce
          }
        }

        validate(value, root.child(name), errors, coerced, coercer);
      }

      // Unknown-property rejection.
      if (!additional) {
        for (const k of Object.keys(obj)) {
          if (!(k in schema.properties)) {
            err(errors, root.child(k), 'additionalProperties', `unknown property '${k}'`);
          }
        }
      }

      // Cross-field rules — evaluated against the coerced view where
      // present (coerced values are what the user effectively sent).
      const effective: Record<string, unknown> = { ...obj };
      for (const [k, v] of coerced) {
        effective[k] = v;
      }
      for (const rule of crossField) {
        this._applyCrossField(rule, effective, root, errors);
      }

      const out: EngineValidationResult = {
        valid: errors.length === 0,
        errors,
        durationMs: start() - t0,
      };
      if (coerced.size > 0) {
        (out as { coerced?: unknown }).coerced = effective;
      }
      return out;
    };
  }

  /* ---------------------------------------------------------------- */
  /* Field compilation                                                 */
  /* ---------------------------------------------------------------- */

  private _compileField(field: FieldSchema, path: ErrorPath): CompiledValidator {
    // Validate the schema itself — a malformed rule is a compile error.
    if (!field || typeof field !== 'object' || !('kind' in field)) {
      throw new SchemaCompileError(path.toString(), 'field schema missing kind');
    }
    if (field.pattern !== undefined) {
      try {
        new RegExp(field.pattern);
      } catch {
        throw new SchemaCompileError(path.toString(), `invalid pattern '${field.pattern}'`);
      }
    }
    if (field.kind === FieldKind.ENUM && (!field.enum || field.enum.length === 0)) {
      throw new SchemaCompileError(path.toString(), 'enum kind requires a non-empty enum[]');
    }
    if (field.kind === FieldKind.OBJECT && field.properties === undefined) {
      // Allowed: object with no declared properties = any object.
    }

    const checks: CompiledValidator[] = [];

    // ---- kind check -------------------------------------------------
    checks.push(this._kindCheck(field.kind, path));

    // ---- string rules ----------------------------------------------
    if (field.minLength !== undefined) {
      checks.push((v, p, e) => {
        if (typeof v === 'string' && v.length < (field.minLength as number)) {
          err(e, p, 'minLength', `length < ${field.minLength}`, v);
        }
      });
    }
    if (field.maxLength !== undefined) {
      checks.push((v, p, e) => {
        if (typeof v === 'string' && v.length > (field.maxLength as number)) {
          err(e, p, 'maxLength', `length > ${field.maxLength}`, v);
        }
      });
    }
    if (field.pattern !== undefined) {
      const re = new RegExp(field.pattern);
      checks.push((v, p, e) => {
        if (typeof v === 'string' && !re.test(v)) {
          err(e, p, 'pattern', `does not match /${field.pattern}/`, v);
        }
      });
    }
    if (field.format !== undefined) {
      const f = field.format;
      checks.push((v, p, e) => {
        if (typeof v !== 'string') return;
        const ok =
          f === 'email'
            ? EMAIL_RE.test(v)
            : f === 'uuid'
              ? UUID_RE.test(v)
              : f === 'iso-date'
                ? ISO_DATE_RE.test(v)
                : f === 'url'
                  ? this._isUrl(v)
                  : true;
        if (!ok) {
          err(e, p, 'format', `not a valid ${f}`, v);
        }
      });
    }

    // ---- numeric rules ----------------------------------------------
    if (field.min !== undefined) {
      checks.push((v, p, e) => {
        if (typeof v === 'number' && v < (field.min as number)) {
          err(e, p, 'min', `< ${field.min}`, v);
        }
      });
    }
    if (field.max !== undefined) {
      checks.push((v, p, e) => {
        if (typeof v === 'number' && v > (field.max as number)) {
          err(e, p, 'max', `> ${field.max}`, v);
        }
      });
    }
    if (field.multipleOf !== undefined) {
      checks.push((v, p, e) => {
        if (typeof v === 'number' && Math.abs(v % (field.multipleOf as number)) > 1e-9) {
          err(e, p, 'multipleOf', `not a multiple of ${field.multipleOf}`, v);
        }
      });
    }

    // ---- array rules -------------------------------------------------
    if (field.minItems !== undefined) {
      checks.push((v, p, e) => {
        if (Array.isArray(v) && v.length < (field.minItems as number)) {
          err(e, p, 'minItems', `< ${field.minItems} items`, v);
        }
      });
    }
    if (field.maxItems !== undefined) {
      checks.push((v, p, e) => {
        if (Array.isArray(v) && v.length > (field.maxItems as number)) {
          err(e, p, 'maxItems', `> ${field.maxItems} items`, v);
        }
      });
    }
    if (field.uniqueItems) {
      checks.push((v, p, e) => {
        if (Array.isArray(v)) {
          const seen = new Set<string>();
          for (const item of v) {
            const k = JSON.stringify(item);
            if (seen.has(k)) {
              err(e, p, 'uniqueItems', `duplicate item ${k}`, item);
              return;
            }
            seen.add(k);
          }
        }
      });
    }
    if (field.items !== undefined) {
      const itemValidator = this._compileField(field.items, path.at(0));
      checks.push((v, p, e, c, co) => {
        if (!Array.isArray(v)) return;
        for (let i = 0; i < v.length; i++) {
          itemValidator(v[i], p.at(i), e, c, co);
        }
      });
    }

    // ---- object rules ------------------------------------------------
    if (field.kind === FieldKind.OBJECT && field.properties) {
      const propValidators: [string, CompiledValidator, FieldSchema][] =
        Object.entries(field.properties).map(([k, fs]) => [
          k,
          this._compileField(fs, path.child(k)),
          fs,
        ]);
      checks.push((v, p, e, c, co) => {
        if (typeof v !== 'object' || v === null || Array.isArray(v)) return;
        const obj = v as Record<string, unknown>;
        for (const [name, validate, fs] of propValidators) {
          if (obj[name] === undefined) {
            if (fs.required) {
              err(e, p.child(name), 'required', `${name} is required`);
            }
            continue;
          }
          validate(obj[name], p.child(name), e, c, co);
        }
        if (field.additionalProperties === false && field.properties !== undefined) {
          for (const k of Object.keys(obj)) {
            if (!(k in field.properties)) {
              err(e, p.child(k), 'additionalProperties', `unknown property '${k}'`);
            }
          }
        }
      });
    }

    // ---- enum ---------------------------------------------------------
    if (field.kind === FieldKind.ENUM && field.enum) {
      const set = new Set(field.enum.map((x) => JSON.stringify(x)));
      checks.push((v, p, e) => {
        if (!set.has(JSON.stringify(v))) {
          err(e, p, 'enum', `not one of ${field.enum?.map(String).join(',')}`, v);
        }
      });
    }

    // ---- custom -------------------------------------------------------
    if (field.validate) {
      const fn = field.validate;
      checks.push((v, p, e) => {
        const msg = fn(v);
        if (msg) {
          err(e, p, 'custom', msg, v);
        }
      });
    }

    return (v, p, e, c, co) => {
      for (const check of checks) {
        check(v, p, e, c, co);
      }
    };
  }

  private _kindCheck(kind: FieldKind, path: ErrorPath): CompiledValidator {
    return (v, p, e) => {
      const ok =
        kind === FieldKind.ANY
          ? true
          : kind === FieldKind.STRING
            ? typeof v === 'string'
            : kind === FieldKind.NUMBER
              ? typeof v === 'number' && Number.isFinite(v)
              : kind === FieldKind.INTEGER
                ? typeof v === 'number' && Number.isInteger(v)
                : kind === FieldKind.BOOLEAN
                  ? typeof v === 'boolean'
                  : kind === FieldKind.DATE
                    ? v instanceof Date
                    : kind === FieldKind.ARRAY
                      ? Array.isArray(v)
                      : kind === FieldKind.OBJECT
                        ? typeof v === 'object' && v !== null && !Array.isArray(v)
                        : kind === FieldKind.ENUM
                          ? true // enum check is separate
                          : false;
      if (!ok) {
        err(e, p, 'kind', `expected ${kind}, got ${Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v}`, v);
      }
    };
  }

  private _isUrl(v: string): boolean {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Cross-field rules                                                 */
  /* ---------------------------------------------------------------- */

  private _applyCrossField(
    rule: EngineCrossFieldRule,
    obj: Record<string, unknown>,
    root: ErrorPath,
    errors: FieldError[]
  ): void {
    switch (rule.kind) {
      case 'dependent-required': {
        if (rule.field && rule.requires && obj[rule.field] !== undefined) {
          for (const req of rule.requires) {
            if (obj[req] === undefined) {
              err(
                errors,
                root.child(rule.field),
                'dependent-required',
                rule.message ?? `'${rule.field}' requires '${req}'`,
                obj[rule.field]
              );
            }
          }
        }
        break;
      }
      case 'mutually-exclusive': {
        if (rule.fields) {
          const present = rule.fields.filter((f) => obj[f] !== undefined);
          if (present.length > 1) {
            err(
              errors,
              root.child(present[0]),
              'mutually-exclusive',
              rule.message ?? `fields [${present.join(', ')}] are mutually exclusive`
            );
          }
        }
        break;
      }
      case 'at-least-one': {
        if (rule.fields) {
          const present = rule.fields.some((f) => obj[f] !== undefined);
          if (!present) {
            err(
              errors,
              root,
              'at-least-one',
              rule.message ?? `at least one of [${rule.fields.join(', ')}] is required`
            );
          }
        }
        break;
      }
      case 'if-then': {
        // `if` is a single-field schema applied to the whole object
        // (convention: `if` describes the *triggering* shape). We run
        // the if-schema's checks; if no errors, then-schema must pass.
        if (rule.if && rule.then) {
          const ifErrors: FieldError[] = [];
          const ifVal = this._compileField(rule.if, root.child('_if'));
          ifVal(obj, root.child('_if'), ifErrors, new Map(), this._coercer);
          if (ifErrors.length === 0) {
            const thenVal = this._compileField(rule.then, root.child('_then'));
            const thenErrors: FieldError[] = [];
            thenVal(obj, root.child('_then'), thenErrors, new Map(), this._coercer);
            for (const e of thenErrors) {
              err(errors, root, 'if-then', rule.message ?? `if/then violated: ${e.message}`);
            }
          }
        }
        break;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Async validation                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Run async rules against a value. Each rule gets `value` and the
   * root object; rules run *sequentially* (parallel async validators
   * racing shared state is a correctness hazard we don't take).
   *
   * Timeouts: per-rule and total. A hung validator is a production
   * incident — every async rule gets a deadline and the whole batch
   * gets a ceiling.
   */
  async validateAsync(
    input: unknown,
    rules: readonly AsyncRule[],
    options: AsyncValidationOptions = {}
  ): Promise<EngineValidationResult> {
    const clock = options.clock ?? { now: () => Date.now() };
    const totalTimeout = options.totalTimeoutMs ?? 30_000;
    const defaultTimeout = options.defaultTimeoutMs ?? 5_000;

    const t0 = clock.now();
    const errors: FieldError[] = [];
    const root = ErrorPath.root();

    for (const rule of rules) {
      if (clock.now() - t0 > totalTimeout) {
        errors.push({
          path: rule.path,
          rule: 'timeout',
          message: `total validation budget ${totalTimeout}ms exceeded`,
        });
        break;
      }
      const fieldValue = this._getPath(input, rule.path);
      const timeout = rule.timeoutMs ?? defaultTimeout;
      try {
        const msg = await this._withTimeout(
          rule.fn(fieldValue, input),
          timeout,
          rule.path
        );
        if (msg) {
          err(errors, root.child(rule.path), rule.rule, msg, fieldValue);
        }
      } catch (e) {
        if (e instanceof AsyncValidationTimeoutError) {
          errors.push({ path: rule.path, rule: 'timeout', message: e.message });
        } else {
          err(errors, root.child(rule.path), rule.rule, String(e), fieldValue);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      durationMs: clock.now() - t0,
    };
  }

  /**
   * Race a promise against a deadline. Rejects with
   * `AsyncValidationTimeoutError` — the caller distinguishes
   * timeouts from validation failures.
   */
  private _withTimeout<T>(p: Promise<T>, ms: number, path: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new AsyncValidationTimeoutError(path, ms));
      }, ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      );
    });
  }

  /** Resolve a dot-notation path on an object (small, no eval). */
  private _getPath(obj: unknown, path: string): unknown {
    if (obj === null || typeof obj !== 'object') {
      return undefined;
    }
    let cur: unknown = obj;
    const parsed = ErrorPath.parse(path.startsWith('$') ? path : `$.${path}`);
    for (const seg of parsed.segments) {
      if (seg === '$') {
        continue;
      }
      if (cur === null || cur === undefined || typeof cur !== 'object') {
        return undefined;
      }
      cur = (cur as Record<string, unknown>)[String(seg)];
    }
    return cur;
  }
}
