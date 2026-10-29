/**
 * Policy Gate Engine
 *
 * Admission-control-style deny rules evaluated against desired resources
 * BEFORE reconcile — the GitOps analog of OPA/Kyverno policies. A gate
 * that fires blocks apply entirely (fail closed); operators see every
 * violation at once rather than fix-one-retry-one.
 *
 * Rules are pure functions over a ResourceSpec; registering them is code
 * (not a DSL), which keeps this engine dependency-free while preserving
 * the deny-before-apply semantics.
 *
 * @module GitopsLayer/Engines
 */

import { DesiredRevision, GateResult, PolicyRule, PolicyViolation, resourceKey, ResourceSpec } from './types';

export interface NamedRule {
  id: string;
  description: string;
  rule: PolicyRule;
}

export class PolicyGateEngine {
  private readonly _rules: Map<string, NamedRule>;

  constructor() {
    this._rules = new Map();
  }

  addRule(rule: NamedRule): void {
    if (this._rules.has(rule.id)) {
      throw new Error(`Duplicate policy rule id: ${rule.id}`);
    }
    this._rules.set(rule.id, rule);
  }

  removeRule(ruleId: string): boolean {
    return this._rules.delete(ruleId);
  }

  /**
   * Evaluate every rule against every resource in a revision.
   * Order of violations is deterministic: rule registration order, then
   * resource key.
   */
  evaluate(revision: DesiredRevision): GateResult {
    const violations: PolicyViolation[] = [];
    const resources = [...revision.resources.values()].sort((a, b) =>
      resourceKey(a.kind, a.name).localeCompare(resourceKey(b.kind, b.name))
    );
    for (const named of this._rules.values()) {
      for (const r of resources) {
        let message: string | null = null;
        try {
          message = named.rule(r);
        } catch (err) {
          // A crashing rule denies — fail closed.
          message = `rule evaluation error: ${err instanceof Error ? err.message : String(err)}`;
        }
        if (message !== null) {
          violations.push({
            ruleId: named.id,
            resourceKey: resourceKey(r.kind, r.name),
            message,
          });
        }
      }
    }
    return { allowed: violations.length === 0, violations };
  }

  ruleCount(): number {
    return this._rules.size;
  }
}
