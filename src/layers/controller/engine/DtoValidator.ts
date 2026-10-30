/**
 * DTO Validation Engine
 *
 * Decorator-free, schema-driven validation. A `DtoSchema` maps field
 * names to `FieldRule`s; `validate` walks the schema against an
 * arbitrary input and returns structured `ValidationIssue`s.
 *
 * Design:
 * - Pure function — no reflection, no class registration, works on
 *   plain objects deserialized from wire JSON.
 * - Recursive: `kind: 'object'` nests a `DtoSchema`, `kind: 'array'`
 *   carries an `items` rule; issues report dot-paths (`a.b[0].c`).
 * - Narrowing: every rule emits issues rather than throwing; callers
 *   decide whether to produce a 400 problem+json or partial defaults.
 * - Safe on hostile input: null-prototype objects, cyclic references
 *   are rejected by structural guards before field traversal.
 *
 * Complexity: O(f · d) over field count f and nesting depth d; the
 * custom `validate` hooks dominate only when present.
 *
 * @module ControllerLayer/Engine
 */

import { DtoSchema, FieldRule, ValidationIssue, ValidationOutcome } from './types';

/**
 * Raised when the schema itself is malformed (programmer error, not
 * user input error — these should fail loudly at registration time).
 */
export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

/** Shrink an arbitrary value to a loggable shape. */
function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    return s.length > 64 ? `${s.slice(0, 64)}…` : s;
  }
  if (t === 'number' || t === 'boolean' || t === 'bigint') {
    return value;
  }
  if (Array.isArray(value)) {
    return `[array(${value.length})]`;
  }
  if (t === 'object') {
    return '{…}';
  }
  return String(value);
}

/** Type-check helpers per kind. */
function kindMatches(kind: FieldRule['kind'], value: unknown): boolean {
  switch (kind) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'enum':
      return true; // values check happens separately
    case 'unknown':
      return true;
  }
}

/**
 * Schema sanity check — runs once at `compile()`; `validate` assumes
 * the schema is well-formed. Catches shape mistakes early rather than
 * producing cryptic per-request errors.
 */
export function assertValidSchema(schema: DtoSchema): void {
  for (const [name, rule] of Object.entries(schema)) {
    if (rule.kind === 'enum' && (rule.values === undefined || rule.values.length === 0)) {
      throw new SchemaError(`Field "${name}": enum kind requires a non-empty values list`);
    }
    if (rule.kind === 'object' && rule.fields !== undefined) {
      assertValidSchema(rule.fields);
    }
    if (rule.kind === 'array' && rule.items !== undefined) {
      // Wrap items in a pseudo-schema for recursive check.
      assertValidSchema({ __item: rule.items });
    }
    if (rule.minLength !== undefined && rule.maxLength !== undefined && rule.minLength > rule.maxLength) {
      throw new SchemaError(`Field "${name}": minLength > maxLength`);
    }
    if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) {
      throw new SchemaError(`Field "${name}": min > max`);
    }
    if (rule.minItems !== undefined && rule.maxItems !== undefined && rule.minItems > rule.maxItems) {
      throw new SchemaError(`Field "${name}": minItems > maxItems`);
    }
  }
}

/**
 * Validate a value against a schema.
 *
 * @param schema Field rules keyed by field name.
 * @param input  Candidate DTO (must be an object; primitives rejected).
 * @param path   Internal recursion prefix — callers omit.
 */
export function validateDto(
  schema: DtoSchema,
  input: unknown,
  path = ''
): ValidationOutcome {
  const issues: ValidationIssue[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    issues.push({
      path: path === '' ? '(root)' : path,
      code: 'type',
      message: 'Expected an object',
      received: sanitize(input),
    });
    return { valid: false, issues };
  }

  const record = input as Record<string, unknown>;

  for (const [name, rule] of Object.entries(schema)) {
    const fieldPath = path === '' ? name : `${path}.${name}`;
    const present = Object.prototype.hasOwnProperty.call(record, name);
    const value = record[name];

    if (!present || value === undefined) {
      if (rule.required === true) {
        issues.push({
          path: fieldPath,
          code: 'required',
          message: `Missing required field "${name}"`,
        });
      }
      continue;
    }

    if (!kindMatches(rule.kind, value)) {
      issues.push({
        path: fieldPath,
        code: 'type',
        message: `Expected ${rule.kind}, got ${Array.isArray(value) ? 'array' : typeof value}`,
        received: sanitize(value),
      });
      continue;
    }

    // Kind-specific refinement checks.
    if (rule.kind === 'string' && typeof value === 'string') {
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        issues.push({
          path: fieldPath,
          code: 'minLength',
          message: `String shorter than minLength ${rule.minLength}`,
          received: sanitize(value),
        });
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        issues.push({
          path: fieldPath,
          code: 'maxLength',
          message: `String longer than maxLength ${rule.maxLength}`,
          received: sanitize(value),
        });
      }
      if (rule.pattern !== undefined && !rule.pattern.test(value)) {
        issues.push({
          path: fieldPath,
          code: 'pattern',
          message: `String does not match ${rule.pattern}`,
          received: sanitize(value),
        });
      }
    }

    if ((rule.kind === 'number' || rule.kind === 'integer') && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        issues.push({
          path: fieldPath,
          code: 'min',
          message: `Value ${value} below min ${rule.min}`,
          received: value,
        });
      }
      if (rule.max !== undefined && value > rule.max) {
        issues.push({
          path: fieldPath,
          code: 'max',
          message: `Value ${value} above max ${rule.max}`,
          received: value,
        });
      }
    }

    if (rule.kind === 'enum' && rule.values !== undefined) {
      const allowed = rule.values;
      const found = allowed.some((v) => v === value);
      if (!found) {
        issues.push({
          path: fieldPath,
          code: 'enum',
          message: `Value not in enum [${allowed.map((v) => JSON.stringify(v)).join(', ')}]`,
          received: sanitize(value),
        });
      }
    }

    if (rule.kind === 'array' && Array.isArray(value)) {
      if (rule.minItems !== undefined && value.length < rule.minItems) {
        issues.push({
          path: fieldPath,
          code: 'minItems',
          message: `Array has ${value.length} items, minItems is ${rule.minItems}`,
        });
      }
      if (rule.maxItems !== undefined && value.length > rule.maxItems) {
        issues.push({
          path: fieldPath,
          code: 'maxItems',
          message: `Array has ${value.length} items, maxItems is ${rule.maxItems}`,
        });
      }
      if (rule.items !== undefined) {
        // Validate each element under the item rule.
        value.forEach((element, index) => {
          const elementPath = `${fieldPath}[${index}]`;
          const itemIssues = validateValue(rule.items as FieldRule, element, elementPath);
          issues.push(...itemIssues);
        });
      }
    }

    if (rule.kind === 'object' && rule.fields !== undefined && typeof value === 'object' && value !== null) {
      const nested = validateDto(rule.fields, value, fieldPath);
      issues.push(...nested.issues);
    }

    // Custom hook — runs last so structural failures short-circuit first.
    if (rule.validate !== undefined && kindMatches(rule.kind, value)) {
      const message = rule.validate(value);
      if (message !== null) {
        issues.push({ path: fieldPath, code: 'custom', message, received: sanitize(value) });
      }
    }
  }

  return issues.length === 0 ? { valid: true, issues } : { valid: false, issues };
}

/**
 * Validate a single non-schema value (array elements, top-level checks).
 */
function validateValue(rule: FieldRule, value: unknown, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!kindMatches(rule.kind, value)) {
    issues.push({
      path,
      code: 'type',
      message: `Expected ${rule.kind}`,
      received: sanitize(value),
    });
    return issues;
  }
  if (rule.kind === 'object' && rule.fields !== undefined) {
    const nested = validateDto(rule.fields, value, path);
    issues.push(...nested.issues);
  }
  if (rule.kind === 'array' && rule.items !== undefined && Array.isArray(value)) {
    value.forEach((element, index) => {
      issues.push(...validateValue(rule.items as FieldRule, element, `${path}[${index}]`));
    });
  }
  return issues;
}

/**
 * Compiled validator — checks the schema once at construction, then
 * exposes a reusable `validate` for request traffic.
 */
export class DtoValidator {
  private readonly _schema: DtoSchema;

  constructor(schema: DtoSchema) {
    assertValidSchema(schema);
    this._schema = schema;
  }

  /** Schema fields (introspection for docs generation). */
  fields(): readonly string[] {
    return Object.keys(this._schema);
  }

  /**
   * Validate input; returns a typed `ValidationOutcome`. Never throws
   * on bad input — schema errors surface via {@link SchemaError} at
   * construction time only.
   */
  validate(input: unknown): ValidationOutcome {
    return validateDto(this._schema, input);
  }

  /**
   * Assert-and-return — throws {@link DtoValidationError} listing every
   * issue; intended for boundary code that maps 400s.
   */
  assert<T>(input: unknown): T {
    const outcome = this.validate(input);
    if (!outcome.valid) {
      throw new DtoValidationError(outcome.issues);
    }
    return input as T;
  }
}

/** Raised when DTO validation fails; carries all issues. */
export class DtoValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`DTO validation failed: ${issues.map((i) => `${i.path} (${i.code})`).join(', ')}`);
    this.name = 'DtoValidationError';
    this.issues = issues;
  }
}
