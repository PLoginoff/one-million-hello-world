/**
 * Validators
 *
 * Pre-coercion validators usable in `MappingRule.validate`, plus a small
 * combinator kit. Each named validator is a pure function returning true
 * or a reason string (validators that return a string supply better error
 * messages than bare false).
 *
 * @module DataTransformationLayer/Engine
 */

import { ValueValidator } from './types';

/**
 * Runs one validator. Returns null on pass, or the failure reason.
 */
export function runValidator(validator: ValueValidator, value: unknown): string | null {
  if (typeof validator === 'string') {
    return BUILTIN_VALIDATORS[validator](value);
  }
  const result = validator(value);
  if (result === true) {
    return null;
  }
  return typeof result === 'string' ? result : 'custom validator rejected value';
}

/**
 * Named builtin validators.
 */
export const BUILTIN_VALIDATORS: Record<string, (value: unknown) => string | null> = {
  required: (v) => (v === undefined || v === null ? 'value is required' : null),
  nonEmpty: (v) => {
    if (typeof v === 'string' && v.trim() === '') return 'string is empty';
    if (Array.isArray(v) && v.length === 0) return 'array is empty';
    if (v === null || v === undefined) return 'value is empty';
    return null;
  },
  isString: (v) => (typeof v === 'string' ? null : `expected string, got ${typeof v}`),
  isNumber: (v) => (typeof v === 'number' && !Number.isNaN(v) ? null : `expected number, got ${typeof v}`),
  isInteger: (v) =>
    typeof v === 'number' && Number.isInteger(v) ? null : 'expected integer',
  isBoolean: (v) => (typeof v === 'boolean' ? null : `expected boolean, got ${typeof v}`),
  isArray: (v) => (Array.isArray(v) ? null : 'expected array'),
  isObject: (v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? null : 'expected object',
  isDateString: (v) =>
    typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? null : 'expected parseable date string',
  positive: (v) => (typeof v === 'number' && v > 0 ? null : 'expected positive number'),
  nonNegative: (v) => (typeof v === 'number' && v >= 0 ? null : 'expected non-negative number'),
};

// ---------------------------------------------------------------------------
// Validator combinators — build complex checks declaratively
// ---------------------------------------------------------------------------

/** value must satisfy every validator. */
export function allOf(...validators: ValueValidator[]): ValueValidator {
  return (value) => {
    for (const v of validators) {
      const err = runValidator(v, value);
      if (err !== null) {
        return err;
      }
    }
    return true;
  };
}

/** value must satisfy at least one validator. */
export function anyOf(...validators: ValueValidator[]): ValueValidator {
  return (value) => {
    const errors: string[] = [];
    for (const v of validators) {
      const err = runValidator(v, value);
      if (err === null) {
        return true;
      }
      errors.push(err);
    }
    return `none of ${validators.length} validators passed: ${errors.join('; ')}`;
  };
}

/** numeric range check, inclusive. */
export function inRange(min: number, max: number): ValueValidator {
  return (value) =>
    typeof value === 'number' && value >= min && value <= max
      ? true
      : `expected number in [${min}, ${max}]`;
}

/** string length bounds. */
export function lengthBetween(min: number, max: number): ValueValidator {
  return (value) => {
    const len =
      typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : null;
    if (len === null) {
      return 'expected string or array with length';
    }
    return len >= min && len <= max ? true : `length ${len} outside [${min}, ${max}]`;
  };
}

/** string pattern check. */
export function matches(re: RegExp): ValueValidator {
  return (value) =>
    typeof value === 'string' && re.test(value) ? true : `does not match ${re}`;
}

/** membership check. */
export function oneOf(...allowed: unknown[]): ValueValidator {
  const set = new Set(allowed);
  return (value) => (set.has(value) ? true : `not one of ${allowed.map(String).join(', ')}`);
}

/** negates a validator. */
export function not(validator: ValueValidator): ValueValidator {
  return (value) => (runValidator(validator, value) === null ? 'negated validator passed' : true);
}
