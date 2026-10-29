/**
 * CommandValidationMiddleware — schema-free composable validation chain.
 *
 * Each `Validator` inspects a command and returns zero or more
 * `ValidationIssue`s. Validators are independent; they can be registered
 * globally (all commands) or per command type. Issues are collected, not
 * thrown — the middleware aggregates all violations then aborts the
 * pipeline with a `CommandValidationError` listing every problem.
 *
 * A validator is just a function `(command, context) => ValidationIssue[]`,
 * so schemas, cross-field rules, and even async database lookups can all
 * participate. For convenience a `ValidationBuilder` provides a fluent
 * field-requirement DSL that covers ~90% of typical command validation.
 *
 * Issue severity: `error` blocks dispatch; `warning` is returned on the
 * result but does not block. `info` is purely annotative.
 *
 * @module CqrsLayer/Implementations
 */

import { Command, CommandContext, MiddlewareFn } from './CqrsCore';

// ------------------------------------------------------------------ types

export type IssueSeverity = 'error' | 'warning' | 'info';

/** One violation produced by one validator. */
export interface ValidationIssue {
  /** Dot-path of the offending field within command.payload, e.g. 'user.email'. */
  readonly path: string;
  /** Severity — only 'error' blocks dispatch. */
  readonly severity: IssueSeverity;
  /** Machine-readable rule name, e.g. 'required', 'minLength'. */
  readonly rule: string;
  /** Human-readable explanation. */
  readonly message: string;
  /** The offending value (redacted if `redacted: true`). */
  readonly value?: unknown;
}

/** Aggregated validation outcome. */
export interface ValidationReport {
  readonly commandType: string;
  readonly issues: ValidationIssue[];
  /** True iff there are no 'error' issues. */
  readonly valid: boolean;
  readonly durationMs: number;
}

/** Error thrown when the middleware decides to abort the pipeline. */
export class CommandValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(commandType: string, issues: ValidationIssue[]) {
    const errs = issues.filter((i) => i.severity === 'error');
    super(
      `Command '${commandType}' failed validation: ` +
        errs.map((i) => `${i.path}: ${i.message}`).join('; '),
    );
    this.name = 'CommandValidationError';
    this.issues = issues;
  }
}

/**
 * A validator returns issues for a command. Async validators are supported
 * (they may need to hit a store — e.g. "email must be unique").
 */
export type Validator = (
  command: Command,
  context: CommandContext,
) => ValidationIssue[] | Promise<ValidationIssue[]>;

// ------------------------------------------------------ path introspection

/**
 * Resolve a dot-path into `obj`. Returns `{found: true, value}` or
 * `{found: false}`. Treats `undefined` as "absent" (a field explicitly set
 * to undefined is indistinguishable from missing at the JSON layer anyway).
 */
export function resolvePath(obj: unknown, path: string): { found: boolean; value?: unknown } {
  if (typeof obj !== 'object' || obj === null) return { found: false };
  const segments = path.split('.');
  let cur: unknown = obj;
  for (const seg of segments) {
    if (typeof cur !== 'object' || cur === null) return { found: false };
    const rec = cur as Record<string, unknown>;
    if (!(seg in rec)) return { found: false };
    cur = rec[seg];
    if (cur === undefined) return { found: false };
  }
  return { found: true, value: cur };
}

// ---------------------------------------------------------- builder rules

/** Rule kinds supported by ValidationBuilder. */
type RuleKind =
  | 'required'
  | 'type'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'pattern'
  | 'oneOf'
  | 'predicate';

interface FieldRule {
  kind: RuleKind;
  path: string;
  expected?: string | number | RegExp | unknown[];
  predicate?: (value: unknown) => boolean;
  message?: string;
  severity: IssueSeverity;
}

/**
 * Fluent validator builder.
 *
 * @example
 *   const v = new ValidationBuilder()
 *     .required('user.email')
 *     .type('user.email', 'string')
 *     .pattern('user.email', /^.+@.+$/)
 *     .build();
 */
export class ValidationBuilder {
  private readonly _rules: FieldRule[] = [];

  required(path: string, opts: { message?: string; severity?: IssueSeverity } = {}): this {
    this._rules.push({
      kind: 'required',
      path,
      severity: opts.severity ?? 'error',
      message: opts.message,
    });
    return this;
  }

  type(path: string, expected: 'string' | 'number' | 'boolean' | 'object' | 'array', opts: { message?: string } = {}): this {
    this._rules.push({ kind: 'type', path, expected, severity: 'error', message: opts.message });
    return this;
  }

  minLength(path: string, min: number, opts: { message?: string } = {}): this {
    this._rules.push({ kind: 'minLength', path, expected: min, severity: 'error', message: opts.message });
    return this;
  }

  maxLength(path: string, max: number, opts: { message?: string } = {}): this {
    this._rules.push({ kind: 'maxLength', path, expected: max, severity: 'error', message: opts.message });
    return this;
  }

  min(path: string, min: number, opts: { message?: string } = {}): this {
    this._rules.push({ kind: 'min', path, expected: min, severity: 'error', message: opts.message });
    return this;
  }

  max(path: string, max: number, opts: { message?: string } = {}): this {
    this._rules.push({ kind: 'max', path, expected: max, severity: 'error', message: opts.message });
    return this;
  }

  pattern(path: string, pattern: RegExp, opts: { message?: string } = {}): this {
    this._rules.push({ kind: 'pattern', path, expected: pattern, severity: 'error', message: opts.message });
    return this;
  }

  oneOf(path: string, values: unknown[], opts: { message?: string } = {}): this {
    this._rules.push({ kind: 'oneOf', path, expected: values, severity: 'error', message: opts.message });
    return this;
  }

  predicate(path: string, pred: (value: unknown) => boolean, opts: { message?: string } = {}): this {
    this._rules.push({ kind: 'predicate', path, predicate: pred, severity: 'error', message: opts.message });
    return this;
  }

  /** Compile to a Validator function. Pure — no captured mutable state. */
  build(): Validator {
    const rules = [...this._rules];
    return (command) => {
      const issues: ValidationIssue[] = [];
      for (const rule of rules) {
        const { found, value } = resolvePath(command.payload, rule.path);
        if (!found) {
          if (rule.kind === 'required') {
            issues.push({
              path: rule.path,
              severity: rule.severity,
              rule: 'required',
              message: rule.message ?? `Field '${rule.path}' is required`,
            });
          }
          continue; // other rules skip missing fields — required is the gate
        }
        const issue = this._check(rule, value);
        if (issue) issues.push(issue);
      }
      return issues;
    };
  }

  private _check(rule: FieldRule, value: unknown): ValidationIssue | undefined {
    const fail = (message: string): ValidationIssue => ({
      path: rule.path,
      severity: rule.severity,
      rule: rule.kind,
      message: rule.message ?? message,
      value,
    });

    switch (rule.kind) {
      case 'type': {
        const exp = rule.expected as string;
        const actual = Array.isArray(value) ? 'array' : typeof value;
        if (exp === 'array') {
          if (!Array.isArray(value)) return fail(`Expected array, got ${actual}`);
        } else if (exp === 'object') {
          if (typeof value !== 'object' || value === null || Array.isArray(value))
            return fail(`Expected object, got ${actual}`);
        } else if (actual !== exp) {
          return fail(`Expected ${exp}, got ${actual}`);
        }
        return undefined;
      }
      case 'minLength': {
        const min = rule.expected as number;
        if (typeof value === 'string' || Array.isArray(value)) {
          if (value.length < min) return fail(`Length ${value.length} < min ${min}`);
        }
        return undefined;
      }
      case 'maxLength': {
        const max = rule.expected as number;
        if (typeof value === 'string' || Array.isArray(value)) {
          if (value.length > max) return fail(`Length ${value.length} > max ${max}`);
        }
        return undefined;
      }
      case 'min': {
        const min = rule.expected as number;
        if (typeof value === 'number' && value < min) return fail(`${value} < min ${min}`);
        return undefined;
      }
      case 'max': {
        const max = rule.expected as number;
        if (typeof value === 'number' && value > max) return fail(`${value} > max ${max}`);
        return undefined;
      }
      case 'pattern': {
        const re = rule.expected as RegExp;
        if (typeof value === 'string' && !re.test(value))
          return fail(`'${value}' does not match ${re}`);
        return undefined;
      }
      case 'oneOf': {
        const values = rule.expected as unknown[];
        if (!values.includes(value)) return fail(`Value not in allowed set`);
        return undefined;
      }
      case 'predicate': {
        if (rule.predicate && !rule.predicate(value)) return fail(`Predicate failed`);
        return undefined;
      }
      case 'required':
        return undefined; // handled upstream
    }
  }
}

// ------------------------------------------------- middleware composition

/**
 * Composes validators into a middleware function usable with
 * `commandBus.use(...)`. Runs all matching validators, aggregates issues,
 * and throws CommandValidationError if any 'error' issue is present.
 *
 * Severity 'warning' issues are attached to `context.metadata.warnings`
 * so downstream middleware/handlers can inspect them.
 */
export class ValidationMiddleware {
  private readonly _global: Validator[] = [];
  private readonly _typed = new Map<string, Validator[]>();

  /** Register a validator for all commands. */
  add(validator: Validator): this {
    this._global.push(validator);
    return this;
  }

  /** Register a validator for one command type. */
  addFor(commandType: string, validator: Validator): this {
    let list = this._typed.get(commandType);
    if (!list) {
      list = [];
      this._typed.set(commandType, list);
    }
    list.push(validator);
    return this;
  }

  /** Run all applicable validators; return a merged report. */
  async validate(command: Command, context: CommandContext): Promise<ValidationReport> {
    const start = Date.now();
    const applicable: Validator[] = [...this._global, ...(this._typed.get(command.type) ?? [])];
    const all: ValidationIssue[] = [];
    for (const v of applicable) {
      const issues = await v(command, context);
      all.push(...issues);
    }
    return {
      commandType: command.type,
      issues: all,
      valid: !all.some((i) => i.severity === 'error'),
      durationMs: Date.now() - start,
    };
  }

  /** Middleware-form — plug into a CommandBus with `bus.use(v.middleware())`. */
  middleware(): MiddlewareFn {
    return async (message, context, next) => {
      const command = message as Command;
      const report = await this.validate(command, context);
      if (report.issues.length > 0) {
        const warnings = report.issues.filter((i) => i.severity !== 'error');
        if (warnings.length > 0) {
          const existing = (context.metadata['warnings'] as ValidationIssue[] | undefined) ?? [];
          context.metadata['warnings'] = [...existing, ...warnings];
        }
      }
      if (!report.valid) {
        throw new CommandValidationError(command.type, report.issues);
      }
      return next();
    };
  }
}
