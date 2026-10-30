/**
 * ABAC Evaluator
 *
 * Evaluates attribute-based policies against the
 * (subject, resource, environment) triple of an access request.
 *
 * A policy matches when ALL of its conditions hold (AND semantics).
 * Each condition reads a dotted path into one of the three roots:
 * `subject`, `resource`, `environment` — e.g.
 * `subject.attributes.department`, `resource.type`,
 * `environment.hour`.
 *
 * Policies are indexed by the first permission segment for a quick
 * candidate pre-filter; full evaluation is O(#candidate policies x
 * #conditions).
 *
 * @module AuthorizationLayer/Engine
 */

import {
  AccessRequest,
  AttributePolicy,
  Condition,
  Permission,
} from './types';
import { permissionMatches } from './RbacResolver';

/** Resolve a dotted path into subject/resource/environment. */
function resolvePath(
  req: AccessRequest,
  path: string
): { found: boolean; value: unknown } {
  const parts = path.split('.');
  let current: unknown;
  const root = parts[0];
  if (root === 'subject') {
    current = req.subject;
  } else if (root === 'resource') {
    current = req.resource;
  } else if (root === 'environment') {
    current = req.environment ?? {};
  } else {
    return { found: false, value: undefined };
  }
  for (let i = 1; i < parts.length; i++) {
    if (current === null || typeof current !== 'object') {
      return { found: false, value: undefined };
    }
    const obj = current as Record<string, unknown>;
    const key = parts[i]!;
    if (!(key in obj)) return { found: false, value: undefined };
    current = obj[key];
  }
  return { found: true, value: current };
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/**
 * Evaluate one condition. Missing attributes fail every operator
 * except `neq` semantics? — no: missing always fails (closed-world).
 */
export function evaluateCondition(req: AccessRequest, cond: Condition): boolean {
  const { found, value } = resolvePath(req, cond.attr);
  switch (cond.op) {
    case 'exists':
      return found;
    case 'eq':
      return found && value === cond.value;
    case 'neq':
      return found && value !== cond.value;
    case 'lt': {
      const a = asNumber(value), b = asNumber(cond.value);
      return found && a !== undefined && b !== undefined && a < b;
    }
    case 'lte': {
      const a = asNumber(value), b = asNumber(cond.value);
      return found && a !== undefined && b !== undefined && a <= b;
    }
    case 'gt': {
      const a = asNumber(value), b = asNumber(cond.value);
      return found && a !== undefined && b !== undefined && a > b;
    }
    case 'gte': {
      const a = asNumber(value), b = asNumber(cond.value);
      return found && a !== undefined && b !== undefined && a >= b;
    }
    case 'in':
      return found && Array.isArray(cond.value) && cond.value.includes(value);
    case 'contains':
      return (
        found &&
        ((Array.isArray(value) && value.includes(cond.value)) ||
          (typeof value === 'string' &&
            typeof cond.value === 'string' &&
            value.includes(cond.value)))
      );
    case 'startsWith':
      return (
        found &&
        typeof value === 'string' &&
        typeof cond.value === 'string' &&
        value.startsWith(cond.value)
      );
    case 'matches': {
      if (!found || typeof value !== 'string') return false;
      const pattern = cond.value;
      if (pattern instanceof RegExp) return pattern.test(value);
      if (typeof pattern === 'string') return new RegExp(pattern).test(value);
      return false;
    }
  }
}

/** Does a policy apply to this request (all conditions ANDed)? */
export function policyApplies(req: AccessRequest, policy: AttributePolicy): boolean {
  return policy.conditions.every((c) => evaluateCondition(req, c));
}

export interface PolicyMatch {
  readonly policy: AttributePolicy;
  readonly permissions: readonly Permission[];
}

/**
 * Evaluates a set of ABAC policies for an access request.
 */
export class AbacEvaluator {
  private _policies: Map<string, AttributePolicy>;

  constructor() {
    this._policies = new Map();
  }

  registerPolicy(policy: AttributePolicy): void {
    this._policies.set(policy.id, policy);
  }

  removePolicy(policyId: string): boolean {
    return this._policies.delete(policyId);
  }

  policies(): AttributePolicy[] {
    return [...this._policies.values()];
  }

  /**
   * Collect all policies applicable to this request, split by effect.
   */
  evaluate(req: AccessRequest): { allows: PolicyMatch[]; denies: PolicyMatch[] } {
    const allows: PolicyMatch[] = [];
    const denies: PolicyMatch[] = [];
    for (const policy of this._policies.values()) {
      if (!policyApplies(req, policy)) continue;
      const match: PolicyMatch = { policy, permissions: policy.permissions };
      if (policy.effect === 'deny') denies.push(match);
      else allows.push(match);
    }
    return { allows, denies };
  }

  /**
   * Which of the applicable policies grant `permission` for the
   * request's resource/action pair? Returns matching policy ids.
   */
  grantingPolicies(
    req: AccessRequest,
    needed: Permission
  ): { allowed: AttributePolicy[]; denied: AttributePolicy[] } {
    const { allows, denies } = this.evaluate(req);
    return {
      allowed: allows
        .filter((m) => m.permissions.some((p) => permissionMatches(p, needed)))
        .map((m) => m.policy),
      denied: denies
        .filter((m) => m.permissions.some((p) => permissionMatches(p, needed)))
        .map((m) => m.policy),
    };
  }
}
