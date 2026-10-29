/**
 * Configuration Engine — Path-Based Schema Validator
 *
 * Validates the effective (merged) config against declarative SchemaRules.
 * Rule paths support `*` (one segment) and `**` (any depth) wildcards, so a
 * single rule like `services.*.timeout = {type:'number', min:0}` covers every
 * service entry.
 *
 * Semantics
 * ---------
 * - `required` rules fail when no config path matches.
 * - Non-required rules only apply where a value exists.
 * - `type` is checked first; on mismatch the remaining checks for that value
 *   are skipped (a string that should be a number also fails `min` — that
 *   noise is unhelpful).
 * - `pattern` applies to the string-coerced scalar.
 * - `min`/`max` apply to numbers; for strings they check length; for arrays
 *   they check element count — a pragmatic multi-arity common in config
 *   schema DSLs.
 * - `validate` is an escape hatch returning `true` or an error message.
 *
 * The validator reports ALL violations (no fail-fast) so a reload that would
 * break three rules surfaces all three before rollback.
 *
 * @module Configuration/Engine
 */

import { ConfigValue, SchemaRule, SchemaViolation, EffectiveConfig, isConfigObject } from './ConfigTypes';
import { pathPatternToRegex } from './SecretMasker';
import { splitPath } from './ConfigMerger';

interface CompiledRule {
  readonly rule: SchemaRule;
  readonly regex: RegExp;
  /** True when the rule path contains no wildcards — cheap direct lookup. */
  readonly exact: boolean;
}

export class ConfigSchema {
  private readonly _rules: CompiledRule[] = [];

  constructor(rules: ReadonlyArray<SchemaRule> = []) {
    for (const r of rules) this.addRule(r);
  }

  addRule(rule: SchemaRule): void {
    this._rules.push({
      rule,
      regex: pathPatternToRegex(rule.path),
      exact: !rule.path.includes('*'),
    });
  }

  get ruleCount(): number {
    return this._rules.length;
  }

  /**
   * Validate `config` against every rule. Two passes:
   *   1. For each rule, find the config paths it governs (direct lookup for
   *      exact paths; scan of `config.paths()` for wildcards — wildcard rules
   *      are rare enough that O(rules × paths) beats building a trie here).
   *   2. Apply the rule's predicates to each governed value; collect
   *      violations rather than throwing.
   */
  validate(config: EffectiveConfig): SchemaViolation[] {
    const violations: SchemaViolation[] = [];
    const allPaths = config.paths();

    for (const { rule, regex, exact } of this._rules) {
      const matches: string[] = [];
      if (exact) {
        if (config.get(rule.path) !== undefined) matches.push(rule.path);
      } else {
        for (const p of allPaths) {
          if (regex.test(p)) matches.push(p);
        }
      }

      if (rule.required === true && matches.length === 0) {
        violations.push({
          path: rule.path,
          kind: 'required',
          message: `required config key '${rule.path}' is missing`,
        });
        continue;
      }

      for (const p of matches) {
        this._validateValue(rule, p, config.get(p) as ConfigValue, violations);
      }
    }
    return violations;
  }

  // ------------------------------------------------------------------ private

  private _validateValue(
    rule: SchemaRule,
    path: string,
    value: ConfigValue,
    violations: SchemaViolation[]
  ): void {
    if (rule.type !== undefined && !this._typeMatches(rule.type, value)) {
      violations.push({
        path,
        kind: 'type',
        message: `expected type '${rule.type}'`,
        expected: rule.type,
        actual: this._typeOf(value),
      });
      return;
    }

    if (rule.enum !== undefined && !rule.enum.some((e) => this._enumEq(e, value))) {
      violations.push({
        path,
        kind: 'enum',
        message: `value must be one of [${rule.enum.map((e) => JSON.stringify(e)).join(', ')}]`,
        actual: JSON.stringify(value),
      });
      return;
    }

    if (rule.pattern !== undefined) {
      const s = typeof value === 'string' ? value : JSON.stringify(value);
      if (typeof s === 'string' && !rule.pattern.test(s)) {
        violations.push({
          path,
          kind: 'pattern',
          message: `value does not match pattern ${rule.pattern.source}`,
          actual: s,
        });
        return;
      }
    }

    if (rule.min !== undefined || rule.max !== undefined) {
      const n = this._magnitudeOf(value);
      if (n !== undefined) {
        if (rule.min !== undefined && n < rule.min) {
          violations.push({ path, kind: 'range', message: `value ${n} below minimum ${rule.min}`, actual: String(n) });
          return;
        }
        if (rule.max !== undefined && n > rule.max) {
          violations.push({ path, kind: 'range', message: `value ${n} above maximum ${rule.max}`, actual: String(n) });
          return;
        }
      }
    }

    if (rule.validate !== undefined) {
      const res = rule.validate(value, path);
      if (res !== true) {
        violations.push({ path, kind: 'custom', message: res });
      }
    }
  }

  private _typeMatches(expected: NonNullable<SchemaRule['type']>, value: ConfigValue): boolean {
    switch (expected) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !Number.isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return isConfigObject(value);
    }
  }

  private _typeOf(value: ConfigValue): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private _enumEq(a: ConfigValue, b: ConfigValue): boolean {
    // Enum comparison is by literal equality for scalars; structured values
    // compare via JSON (rules rarely use object enums).
    if (a === b) return true;
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  /**
   * Magnitude used for range checks: number → itself, string → length,
   * array → length. Other types return undefined (range not applicable).
   */
  private _magnitudeOf(value: ConfigValue): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value.length;
    if (Array.isArray(value)) return value.length;
    return undefined;
  }
}

/** Utility: depth of a dot path (segments). Used by callers to order rules. */
export function pathDepth(path: string): number {
  return splitPath(path).length;
}
