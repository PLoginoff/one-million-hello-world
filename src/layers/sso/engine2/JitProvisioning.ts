/**
 * Just-In-Time Provisioning Policies
 *
 * On a user's first login via an IdP, materialise a local account by
 * applying a per-IdP provisioning policy:
 *
 *   - attribute mapping (source claim → local field with transforms),
 *   - default values for missing claims,
 *   - required-claim validation (reject provisioning when absent),
 *   - role/group assignment derived from claims (e.g. `groups` contains
 *     'admins' → role 'admin'),
 *   - update-on-login behaviour (keep local fields fresh vs. one-shot).
 *
 * This complements `federation/AttributeMapper` (single-shot mapping);
 * the policy engine wraps mapping with *provisioning decisions* and
 * account lifecycle.
 *
 * @module Sso/Engine2
 */

export type ClaimTransform =
  | 'identity'
  | 'lowercase'
  | 'uppercase'
  | 'email-local'   // part before @
  | 'email-domain'
  | 'split:comma'
  | 'split:space'
  | 'first'
  | 'join:space';

export interface AttributeRule {
  /** Local field name. */
  readonly target: string;
  /** Source claim; if missing, `defaultValue` applies. */
  readonly source?: string;
  readonly transform?: ClaimTransform;
  readonly defaultValue?: unknown;
  /** Fail provisioning if source claim is absent AND no default. */
  readonly required?: boolean;
}

/** Assign a role when a claim matches. */
export interface RoleRule {
  readonly role: string;
  /** Claim to inspect. */
  readonly claim: string;
  /** Required claim value; undefined = claim merely present. */
  readonly equals?: string;
  /** Claim (array-valued) contains this value. */
  readonly contains?: string;
}

export interface ProvisioningPolicy {
  readonly idpId: string;
  readonly attributes: readonly AttributeRule[];
  readonly roles: readonly RoleRule[];
  /** Refresh local attributes on every login, not just first. */
  readonly updateOnLogin: boolean;
  /** Claims that must be present or provisioning fails outright. */
  readonly requiredClaims: readonly string[];
}

export interface ProvisionedAccount {
  readonly accountId: string;
  readonly idpId: string;
  readonly subject: string;
  attributes: Record<string, unknown>;
  roles: readonly string[];
  readonly createdAt: number;
  lastLoginAt: number;
  loginCount: number;
}

export interface ProvisionOutcome {
  readonly account?: ProvisionedAccount;
  readonly created: boolean; // false = existing account updated/returned
  readonly errors: readonly string[];
}

export class JitProvisioner {
  private readonly policies = new Map<string, ProvisioningPolicy>();
  private readonly accounts = new Map<string, ProvisionedAccount>(); // idpId:subject → account
  private seq = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  registerPolicy(policy: ProvisioningPolicy): void {
    this.policies.set(policy.idpId, policy);
  }

  policy(idpId: string): ProvisioningPolicy | undefined {
    return this.policies.get(idpId);
  }

  /**
   * Handle a login: provision on first sight, optionally update after.
   * `claims` is the IdP's assertion (string or string[] values).
   */
  provision(
    idpId: string,
    subject: string,
    claims: Readonly<Record<string, string | readonly string[]>>
  ): ProvisionOutcome {
    const policy = this.policies.get(idpId);
    if (!policy) {
      return { created: false, errors: [`no provisioning policy for idp ${idpId}`] };
    }

    const errors: string[] = [];
    for (const c of policy.requiredClaims) {
      if (claims[c] === undefined) errors.push(`missing required claim '${c}'`);
    }
    if (errors.length > 0) return { created: false, errors };

    const key = idpId + ':' + subject;
    const existing = this.accounts.get(key);
    if (existing) {
      if (policy.updateOnLogin) {
        const { attrs, errors: ae } = this.applyAttributes(policy, claims);
        if (ae.length === 0) existing.attributes = attrs;
        errors.push(...ae);
      }
      existing.roles = this.assignRoles(policy, claims);
      existing.lastLoginAt = this.clock();
      existing.loginCount += 1;
      return { account: existing, created: false, errors };
    }

    const { attrs, errors: attrErrors } = this.applyAttributes(policy, claims);
    if (attrErrors.length > 0) return { created: false, errors: attrErrors };

    const account: ProvisionedAccount = {
      accountId: `acct-${++this.seq}`,
      idpId,
      subject,
      attributes: attrs,
      roles: this.assignRoles(policy, claims),
      createdAt: this.clock(),
      lastLoginAt: this.clock(),
      loginCount: 1,
    };
    this.accounts.set(key, account);
    return { account, created: true, errors: [] };
  }

  account(idpId: string, subject: string): ProvisionedAccount | undefined {
    return this.accounts.get(idpId + ':' + subject);
  }

  private applyAttributes(
    policy: ProvisioningPolicy,
    claims: Readonly<Record<string, string | readonly string[]>>
  ): { attrs: Record<string, unknown>; errors: string[] } {
    const attrs: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const rule of policy.attributes) {
      const raw = rule.source !== undefined ? claims[rule.source] : undefined;
      if (raw === undefined) {
        if (rule.defaultValue !== undefined) {
          attrs[rule.target] = rule.defaultValue;
        } else if (rule.required) {
          errors.push(`missing required attribute source '${rule.source}' for '${rule.target}'`);
        }
        continue;
      }
      attrs[rule.target] = applyTransform(raw, rule.transform ?? 'identity');
    }
    return { attrs, errors };
  }

  private assignRoles(
    policy: ProvisioningPolicy,
    claims: Readonly<Record<string, string | readonly string[]>>
  ): readonly string[] {
    const roles = new Set<string>();
    for (const r of policy.roles) {
      const raw = claims[r.claim];
      if (raw === undefined) continue;
      const values = Array.isArray(raw) ? (raw as readonly string[]) : [raw as string];
      if (r.contains !== undefined) {
        if (values.includes(r.contains)) roles.add(r.role);
      } else if (r.equals !== undefined) {
        if (values.some((v) => v === r.equals)) roles.add(r.role);
      } else {
        roles.add(r.role); // mere presence
      }
    }
    return [...roles];
  }
}

/** Apply a transform to a claim value. */
export function applyTransform(
  raw: string | readonly string[],
  t: ClaimTransform
): unknown {
  const arr: readonly string[] = Array.isArray(raw) ? (raw as readonly string[]) : [raw as string];
  switch (t) {
    case 'identity':
      return arr.length === 1 ? arr[0] : arr.slice();
    case 'lowercase':
      return arr.length === 1 ? arr[0].toLowerCase() : arr.map((s) => s.toLowerCase());
    case 'uppercase':
      return arr.length === 1 ? arr[0].toUpperCase() : arr.map((s) => s.toUpperCase());
    case 'email-local': {
      const v = arr[0] ?? '';
      const at = v.indexOf('@');
      return at >= 0 ? v.slice(0, at) : v;
    }
    case 'email-domain': {
      const v = arr[0] ?? '';
      const at = v.indexOf('@');
      return at >= 0 ? v.slice(at + 1).toLowerCase() : '';
    }
    case 'split:comma': {
      const v = arr.join(',');
      return v.split(',').map((s) => s.trim()).filter(Boolean);
    }
    case 'split:space': {
      const v = arr.join(' ');
      return v.split(/\s+/).filter(Boolean);
    }
    case 'first':
      return arr[0] ?? '';
    case 'join:space':
      return arr.join(' ');
    default:
      return raw;
  }
}
