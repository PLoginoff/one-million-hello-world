/**
 * Secrets Layer — Path-Based Access Policies
 *
 * Vault-style capability policies: principals hold policy documents that
 * grant capabilities (`read`, `write`, `delete`, `list`, `lease`) on path
 * patterns. Evaluation is deny-by-default with explicit grants; a `deny`
 * rule always wins over a matching `allow` (explicit deny > allow, matching
 * IAM semantics).
 *
 * Path grammar: same `*`/`**` wildcards as the rest of the layer.
 *   `kv/web/*`        one level under kv/web
 *   `kv/**`           anything under kv
 *   `kv/db/password`  exact
 *
 * Composition: a principal's effective policy is the union of all its
 * attached policy docs — the most permissive matching grant wins, unless a
 * deny matches.
 *
 * @module Secrets/Vault
 */

import { pathPatternToRegex } from '../../configuration/engine/SecretMasker';

export type SecretCapability = 'read' | 'write' | 'delete' | 'list' | 'lease';

export const ALL_CAPABILITIES: ReadonlyArray<SecretCapability> = ['read', 'write', 'delete', 'list', 'lease'];

export interface PolicyRule {
  /** Path pattern — `*`/`**` wildcards, `/`-separated segments. */
  readonly path: string;
  readonly capabilities: ReadonlyArray<SecretCapability>;
  /** 'allow' (default) or 'deny' — deny wins over any matching allow. */
  readonly effect?: 'allow' | 'deny';
}

export interface PolicyDocument {
  readonly name: string;
  readonly rules: ReadonlyArray<PolicyRule>;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly capability: SecretCapability;
  readonly path: string;
  /** Policy that decided (the deny, or the most specific allow). */
  readonly decidedBy?: string;
  readonly reason: string;
}

interface CompiledRule {
  readonly rule: PolicyRule;
  readonly regex: RegExp;
  readonly policy: string;
  /** Specificity for tie-breaking (more literal segments = more specific). */
  readonly specificity: number;
}

function toRegex(path: string): RegExp {
  return pathPatternToRegex(path.split('/').join('.'));
}

function specificity(path: string): number {
  let s = 0;
  for (const seg of path.split('/')) {
    if (seg === '**') s += 0;
    else if (seg === '*') s += 1;
    else s += 2;
  }
  return s;
}

export class SecretPolicyEngine {
  private readonly _policies = new Map<string, PolicyDocument>();
  private readonly _compiled = new Map<string, CompiledRule[]>();
  private readonly _bindings = new Map<string, Set<string>>(); // principal → policy names

  /** Attach a policy document. */
  addPolicy(doc: PolicyDocument): void {
    this._policies.set(doc.name, doc);
    this._compiled.set(
      doc.name,
      doc.rules.map((rule) => ({ rule, regex: toRegex(rule.path), policy: doc.name, specificity: specificity(rule.path) }))
    );
  }

  removePolicy(name: string): boolean {
    this._compiled.delete(name);
    for (const set of this._bindings.values()) set.delete(name);
    return this._policies.delete(name);
  }

  /** Grant `principal` the policies. */
  bind(principal: string, policyNames: ReadonlyArray<string>): void {
    let set = this._bindings.get(principal);
    if (!set) {
      set = new Set();
      this._bindings.set(principal, set);
    }
    for (const p of policyNames) {
      if (!this._policies.has(p)) throw new Error(`unknown policy '${p}'`);
      set.add(p);
    }
  }

  unbind(principal: string, policyName: string): void {
    this._bindings.get(principal)?.delete(policyName);
  }

  /**
   * Decide whether `principal` may `capability` on `path`.
   * Algorithm: gather all matching rules across the principal's bound
   * policies. Any matching `deny` → denied (short-circuit). Else the most
   * specific matching `allow` grants. No match → denied (default deny).
   */
  decide(principal: string, capability: SecretCapability, path: string): PolicyDecision {
    const policyNames = this._bindings.get(principal);
    if (!policyNames || policyNames.size === 0) {
      return { allowed: false, capability, path, reason: `principal '${principal}' has no bound policies` };
    }
    const normalized = path.split('/').join('.');
    const denials: CompiledRule[] = [];
    const allows: CompiledRule[] = [];
    for (const pn of policyNames) {
      for (const cr of this._compiled.get(pn) ?? []) {
        if (!cr.rule.capabilities.includes(capability)) continue;
        if (!cr.regex.test(normalized)) continue;
        if (cr.rule.effect === 'deny') denials.push(cr);
        else allows.push(cr);
      }
    }
    if (denials.length > 0) {
      // Most specific deny is the deciding one (for diagnostics).
      denials.sort((a, b) => b.specificity - a.specificity);
      return {
        allowed: false,
        capability,
        path,
        decidedBy: denials[0].policy,
        reason: `explicitly denied by policy '${denials[0].policy}'`,
      };
    }
    if (allows.length === 0) {
      return { allowed: false, capability, path, reason: 'no matching allow rule (default deny)' };
    }
    allows.sort((a, b) => b.specificity - a.specificity);
    return {
      allowed: true,
      capability,
      path,
      decidedBy: allows[0].policy,
      reason: `granted by policy '${allows[0].policy}'`,
    };
  }

  /** True shorthand — throws nothing. */
  isAllowed(principal: string, capability: SecretCapability, path: string): boolean {
    return this.decide(principal, capability, path).allowed;
  }

  /** Filter a candidate path list to what `principal` may `capability` on. */
  filterAllowed(principal: string, capability: SecretCapability, paths: ReadonlyArray<string>): string[] {
    return paths.filter((p) => this.isAllowed(principal, capability, p));
  }
}
