/**
 * AttributeReleaseEngine
 *
 * Per-SP attribute-release policy evaluation.
 *
 * Model:
 *  - A policy is an ordered rule list; first matching rule decides
 *    ('release' | 'deny'). Unmatched attributes default to DENY —
 *    conservative, matching real IdP defaults.
 *  - Rules match by exact attribute name or by prefix wildcard
 *    ('groups.*' matches 'groups.admins' but not 'groups').
 *  - A release rule may carry a `values` allowlist: only listed values
 *    survive filtering. A deny rule with `values` denies just those.
 *  - Attribute values are multi-valued (string[]), SAML-style.
 *
 * Policies are compiled to a small matcher array for O(#rules)
 * evaluation per attribute — trivially fast at realistic policy sizes.
 *
 * @module IdentityProvider/Federation
 */

import { AttributeReleasePolicy, AttributeRule } from './types';

interface CompiledRule {
  /** Exact name to match, or prefix for wildcard. */
  match: string;
  wildcard: boolean;
  action: 'release' | 'deny';
  values?: Set<string>;
}

function compile(rule: AttributeRule): CompiledRule {
  const wildcard = rule.attribute.endsWith('*');
  const match = wildcard ? rule.attribute.slice(0, -1) : rule.attribute;
  return {
    match,
    wildcard,
    action: rule.action,
    values: rule.values !== undefined ? new Set(rule.values) : undefined,
  };
}

export class AttributeReleaseEngine {
  private readonly _policies: Map<string, CompiledRule[]> = new Map();

  /** Register (or replace) a policy. */
  registerPolicy(policy: AttributeReleasePolicy): void {
    this._policies.set(policy.id, policy.rules.map(compile));
  }

  /** Remove a policy. */
  removePolicy(policyId: string): boolean {
    return this._policies.delete(policyId);
  }

  /** True if a policy exists. */
  hasPolicy(policyId: string): boolean {
    return this._policies.has(policyId);
  }

  /**
   * Evaluate attribute release for a relying party.
   *
   * @param policyId  the bound policy; if undefined/unknown, the
   *                  `defaultRelease` set is released verbatim.
   * @param source    asserted attributes from the identity store
   * @param defaultRelease used when no policy is bound (defaults to
   *                  ['sub','name','email'] style minimal set)
   */
  release(
    policyId: string | undefined,
    source: Record<string, string[]>,
    defaultRelease: string[] = ['name', 'email']
  ): Record<string, string[]> {
    const rules = policyId !== undefined ? this._policies.get(policyId) : undefined;
    if (!rules) {
      const out: Record<string, string[]> = {};
      for (const name of defaultRelease) {
        if (source[name] !== undefined) out[name] = [...source[name]];
      }
      return out;
    }

    const out: Record<string, string[]> = {};
    for (const [name, values] of Object.entries(source)) {
      const rule = this._match(rules, name);
      if (!rule || rule.action === 'deny') {
        // Deny rule may still allow all-but-listed values if it carries
        // a values filter — implement as "deny those values only".
        if (rule?.action === 'deny' && rule.values) {
          const kept = values.filter((v) => !rule.values!.has(v));
          if (kept.length > 0) out[name] = kept;
        }
        continue;
      }
      // release
      if (rule.values) {
        const kept = values.filter((v) => rule.values!.has(v));
        if (kept.length > 0) out[name] = kept;
      } else {
        out[name] = [...values];
      }
    }
    return out;
  }

  private _match(rules: CompiledRule[], attribute: string): CompiledRule | undefined {
    for (const r of rules) {
      if (r.wildcard) {
        if (attribute.startsWith(r.match)) return r;
      } else if (r.match === attribute) {
        return r;
      }
    }
    return undefined;
  }
}
