/**
 * Validation Engine — shared types.
 *
 * Vocabulary:
 * - `SchemaCompiler`    — compiles a declarative schema into a reusable
 *                         validation closure; parse cost paid once.
 * - `CrossFieldRules`   — dependent-required + if/then conditional
 *                         schemas; evaluated after per-field rules.
 * - `CoercionPipeline`  — ordered string→typed conversions with a
 *                         strict mode that refuses lossy coercion.
 * - `validateAsync`     — async field validators with per-call and
 *                         overall timeouts.
 * - `ErrorPath`         — dot-notation path builder for nested errors
 *                         (`user.address.zip`, `items[3].id`).
 *
 * Design constraint: the compiled validator is a *closure*, not an
 * interpreter — the schema walks once at compile time and produces
 * native predicates; validation then runs with zero schema-lookup.
 *
 * @module ValidationLayer/Engine
 */

import { ValidationError } from '../utils/ValidationError';

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class SchemaCompileError extends ValidationError {
  constructor(path: string, reason: string) {
    super('SCHEMA_COMPILE', `Invalid schema at '${path}': ${reason}`, path);
    this.name = 'SchemaCompileError';
  }
}

export class AsyncValidationTimeoutError extends ValidationError {
  constructor(path: string, timeoutMs: number) {
    super(
      'VALIDATION_TIMEOUT',
      `Async validation of '${path}' timed out after ${timeoutMs}ms`,
      path
    );
    this.name = 'AsyncValidationTimeoutError';
  }
}

/* ------------------------------------------------------------------ */
/* Error model                                                         */
/* ------------------------------------------------------------------ */

/**
 * One validation failure. `path` is dot-notation for objects and
 * `[i]` for arrays — `user.address.zip`, `items[0].id`.
 */
export interface FieldError {
  readonly path: string;
  readonly rule: string;
  readonly message: string;
  /** The rejected value (kept small — toString'd). */
  readonly value?: unknown;
}

export interface EngineValidationResult {
  readonly valid: boolean;
  readonly errors: readonly FieldError[];
  /**
   * Coerced output — the input with coercion applied. `undefined`
   * when no coercion ran or validation was strict.
   */
  readonly coerced?: unknown;
  readonly durationMs: number;
}

/* ------------------------------------------------------------------ */
/* Declarative schema                                                  */
/* ------------------------------------------------------------------ */

export const enum FieldKind {
  STRING = 'string',
  NUMBER = 'number',
  INTEGER = 'integer',
  BOOLEAN = 'boolean',
  DATE = 'date',
  ARRAY = 'array',
  OBJECT = 'object',
  ENUM = 'enum',
  ANY = 'any',
}

/**
 * One field's declarative rules. Compiled exactly once; every entry
 * becomes a predicate in the closure.
 */
export interface FieldSchema {
  readonly kind: FieldKind;
  /** Required = key must be present (undefined counts as absent). */
  readonly required?: boolean;
  // string
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: 'email' | 'url' | 'uuid' | 'iso-date';
  // number / integer
  readonly min?: number;
  readonly max?: number;
  readonly multipleOf?: number;
  // array
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly items?: FieldSchema;
  readonly uniqueItems?: boolean;
  // object
  readonly properties?: Readonly<Record<string, FieldSchema>>;
  readonly additionalProperties?: boolean;
  // enum
  readonly enum?: readonly unknown[];
  // coercion
  readonly coerce?: boolean | 'strict';
  // custom
  readonly validate?: (value: unknown) => string | null;
}

/** Top-level schema: an object descriptor plus cross-field rules. */
export interface ObjectSchema {
  readonly kind: 'object';
  readonly properties: Readonly<Record<string, FieldSchema>>;
  readonly additionalProperties?: boolean;
  readonly crossField?: readonly EngineCrossFieldRule[];
}

/* ------------------------------------------------------------------ */
/* Cross-field rules                                                   */
/* ------------------------------------------------------------------ */

export interface EngineCrossFieldRule {
  /** Human-readable rule id for diagnostics. */
  readonly id: string;
  readonly kind: 'dependent-required' | 'if-then' | 'mutually-exclusive' | 'at-least-one';
  /**
   * dependent-required: when `field` is present, `requires` must be.
   * if-then:            when `if` schema matches the object, `then`
   *                     schema must also match.
   * mutually-exclusive: at most one of `fields` may be present.
   * at-least-one:       at least one of `fields` must be present.
   */
  readonly field?: string;
  readonly requires?: readonly string[];
  readonly fields?: readonly string[];
  readonly if?: FieldSchema;
  readonly then?: FieldSchema;
  readonly message?: string;
}

/* ------------------------------------------------------------------ */
/* Coercion                                                            */
/* ------------------------------------------------------------------ */

export interface CoercionOptions {
  /**
   * Strict mode: only *exact* representations coerce — '42' → 42 but
   * '4.2' does NOT coerce to integer, 'yes' does NOT coerce to true.
   * Loose mode is permissive (Number(x) semantics + true/false/yes/no
   * /on/off/1/0). Default: loose.
   */
  readonly strict?: boolean;
  /** Strings representing empty → treated as absent when true. */
  readonly emptyStringAsAbsent?: boolean;
}

export interface CoercionResult {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly reason?: string;
}

/* ------------------------------------------------------------------ */
/* Async validation                                                    */
/* ------------------------------------------------------------------ */

export interface AsyncRule {
  readonly path: string;
  readonly rule: string;
  readonly fn: (value: unknown, root: unknown) => Promise<string | null>;
  /** Per-rule timeout, ms. Overrides the engine default. */
  readonly timeoutMs?: number;
}

export interface AsyncValidationOptions {
  /** Per-rule default timeout. */
  readonly defaultTimeoutMs?: number;
  /** Overall cap across all async rules. */
  readonly totalTimeoutMs?: number;
  /** Clock — injectable for tests. */
  readonly clock?: { now(): number };
}
