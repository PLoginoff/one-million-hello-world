/**
 * Config Validator
 *
 * The semantic half of parity: `checkParity` proves the keys match;
 * this validates the *values* against declared rules — a `TIMEOUT_MS`
 * that parses but is `0` or negative is a parity pass and a production
 * incident.
 *
 * Rules are per-key typed checks: `int`/`positive-int`/`enum`/`url`/
 * `nonempty`/`pattern`. The validator runs rules against ONE side's
 * env — run it against `green` pre-switch (catch a bad new config
 * before cutover) and optionally `blue` to find drift already live.
 *
 * A rule whose key is absent is an issue unless `optional` — absence
 * you didn't declare is a parity-style bug, not a validation bug.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import { EnvVarEntry } from './types';

export type RuleKind = 'int' | 'positive-int' | 'enum' | 'url' | 'nonempty' | 'pattern';

export interface ConfigRule {
  readonly key: string;
  readonly kind: RuleKind;
  /** enum: allowed values; pattern: glob with `*`/`?`. */
  readonly values?: readonly string[];
  readonly optional?: boolean;
}

export interface ValidationIssue {
  readonly key: string;
  readonly rule: RuleKind;
  readonly detail: string;
  /** The offending value (never for secrets — value withheld). */
  readonly value?: string;
}

function check(rule: ConfigRule, entry: EnvVarEntry | undefined): ValidationIssue | null {
  if (entry === undefined) {
    if (rule.optional) return null;
    return { key: rule.key, rule: rule.kind, detail: 'required key is absent' };
  }
  if (entry.secret) {
    // Secret rules can't inspect the plaintext — a hash mismatch is a
    // parity concern, not a validation one. Only presence is checkable.
    return null;
  }
  const v = entry.value;
  if (v === undefined) {
    return { key: rule.key, rule: rule.kind, detail: 'no value to validate' };
  }
  switch (rule.kind) {
    case 'int':
      if (!/^-?\d+$/.test(v)) {
        return { key: rule.key, rule: 'int', detail: `not an integer`, value: v };
      }
      return null;
    case 'positive-int': {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) {
        return { key: rule.key, rule: 'positive-int', detail: `not a positive integer`, value: v };
      }
      return null;
    }
    case 'enum':
      if (rule.values === undefined || !rule.values.includes(v)) {
        return {
          key: rule.key, rule: 'enum',
          detail: `not in [${(rule.values ?? []).join(', ')}]`, value: v,
        };
      }
      return null;
    case 'url':
      try {
        const u = new URL(v);
        if (!u.protocol.startsWith('http')) throw new Error();
      } catch {
        return { key: rule.key, rule: 'url', detail: 'not a valid http(s) URL', value: v };
      }
      return null;
    case 'nonempty':
      if (v.trim() === '') {
        return { key: rule.key, rule: 'nonempty', detail: 'empty value', value: v };
      }
      return null;
    case 'pattern': {
      const pattern = rule.values?.[0];
      if (pattern === undefined) {
        return { key: rule.key, rule: 'pattern', detail: 'no pattern supplied', value: v };
      }
      const re = new RegExp(
        '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '.*' : c === '?' ? '.' : `\\${c}`)) + '$'
      );
      if (!re.test(v)) {
        return { key: rule.key, rule: 'pattern', detail: `does not match ${pattern}`, value: v };
      }
      return null;
    }
  }
}

export function validate(
  env: readonly EnvVarEntry[],
  rules: readonly ConfigRule[]
): ValidationIssue[] {
  const byKey = new Map(env.map((e) => [e.key, e]));
  const issues: ValidationIssue[] = [];
  for (const rule of rules) {
    const issue = check(rule, byKey.get(rule.key));
    if (issue) issues.push(issue);
  }
  return issues;
}
