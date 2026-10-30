/**
 * ValidationPipeline — pre-execution checks before a command reaches
 * the aggregate.
 *
 * Runs a chain of validators over a command plus optional aggregate
 * snapshot (for state-dependent rules like "aggregate must be open").
 * Each validator returns violations; the pipeline collects them all
 * (no fail-fast) so callers can return the complete violation list —
 * API clients want "these 3 fields are wrong", not whack-a-mole.
 *
 * Validator ordering: `severity` ordering is not used — all violations
 * are reported; the first validator that throws halts the pipeline and
 * the exception is reported as an infrastructure failure, not a
 * business violation.
 *
 * Standard validators provided: requiredFields, schemaShape (declarative
 * type checks), expectedVersion (optimistic concurrency against the
 * loaded aggregate), business invariant predicates.
 *
 * Complexity: O(#validators) per command.
 *
 * @module WriteModelLayer/Engine2
 */

import { WmCommand } from './types';

export interface Violation {
  readonly field?: string;
  readonly rule: string;
  readonly message: string;
}

export type ValidationVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly Violation[] };

export interface CommandContext {
  readonly command: WmCommand;
  /** Loaded aggregate state for state-dependent checks (version, status). */
  readonly aggregate?: { version: number; state: Record<string, unknown> };
}

export type ValidatorFn = (ctx: CommandContext) => Violation[];

export class ValidationPipeline {
  private readonly _validators: Array<{ name: string; fn: ValidatorFn }> = [];

  /** Register a named validator. Order = execution order. */
  add(name: string, fn: ValidatorFn): this {
    this._validators.push({ name, fn });
    return this;
  }

  /**
   * Run all validators; collect ALL violations (no fail-fast so callers
   * see every problem at once). A validator throwing is infrastructure
   * failure — reported as a single rule-error violation, pipeline halts.
   */
  run(ctx: CommandContext): ValidationVerdict {
    const violations: Violation[] = [];
    for (const v of this._validators) {
      try {
        violations.push(...v.fn(ctx));
      } catch (e) {
        violations.push({
          rule: v.name,
          message: `validator error: ${e instanceof Error ? e.message : String(e)}`,
        });
        break; // infrastructure failure — stop, report what we have
      }
    }
    return violations.length === 0 ? { ok: true } : { ok: false, violations };
  }
}

// ---------------------------------------------------------------- validators

/** Required payload fields present and non-null. */
export function requiredFields(fields: readonly string[]): ValidatorFn {
  return ({ command }) => {
    const out: Violation[] = [];
    for (const f of fields) {
      if (!(f in command.payload) || command.payload[f] === null || command.payload[f] === undefined) {
        out.push({ field: f, rule: 'required', message: `field '${f}' is required` });
      }
    }
    return out;
  };
}

/** Declarative shape checks: field → expected 'string'|'number'|'boolean'|'array'|'object'. */
export function schemaShape(shape: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>): ValidatorFn {
  return ({ command }) => {
    const out: Violation[] = [];
    for (const [field, want] of Object.entries(shape)) {
      const v = (command.payload as Record<string, unknown>)[field];
      if (v === undefined || v === null) continue; // requiredFields covers presence
      const ok =
        want === 'array' ? Array.isArray(v)
        : want === 'object' ? typeof v === 'object' && !Array.isArray(v)
        : typeof v === want;
      if (!ok) out.push({ field, rule: 'shape', message: `field '${field}' must be ${want}` });
    }
    return out;
  };
}

/** Optimistic concurrency: command.expectedVersion must equal loaded aggregate version. */
export function expectedVersion(): ValidatorFn {
  return ({ command, aggregate }) => {
    if (command.expectedVersion === undefined) return [];
    if (!aggregate) {
      return [{ rule: 'concurrency', message: 'aggregate not loaded — cannot verify expectedVersion' }];
    }
    if (aggregate.version !== command.expectedVersion) {
      return [{
        rule: 'concurrency',
        message: `expectedVersion ${command.expectedVersion} != aggregate version ${aggregate.version}`,
      }];
    }
    return [];
  };
}

/** Named business invariant over command + aggregate state. */
export function invariant(name: string, predicate: (ctx: CommandContext) => boolean, message: string): ValidatorFn {
  return (ctx) => (predicate(ctx) ? [] : [{ rule: `invariant:${name}`, message }]);
}
