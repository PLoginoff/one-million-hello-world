/**
 * ScopeAuthorizer — maps token scopes to permission checks.
 *
 * Tokens carry scopes in `scope` (space-delimited string, RFC 6749 §3.3)
 * or `scp` (array — Microsoft's convention); both are normalized.
 *
 * Permission model — hierarchical scopes `resource:action`:
 *
 *   'read:users'      → permission 'read' on 'users'
 *   'admin'           → permission 'admin' on everything in its domain
 *   'orders:*'        → all actions on 'orders'
 *   '*'               → superuser (rare, but honest)
 *
 * The authorizer compiles a *policy* (permission → required scopes) and
 * answers `can(subject, permission)` with which scopes satisfied it —
 * or what's missing. Wildcard expansion happens at check time, so
 * `orders:*` satisfies `orders:read`, `orders:write`, etc.
 *
 * Complexity: check is O(S·R) where S = token scopes, R = required
 * scopes for the permission — both small.
 *
 * @module JwtValidationLayer/Engine2
 */

import { TokenClaims2 } from './types';

/** Extract the scope set from a claims object (`scope` or `scp`). */
export function tokenScopes(claims: TokenClaims2): Set<string> {
  const out = new Set<string>();
  if (typeof claims.scope === 'string') {
    for (const s of claims.scope.split(/\s+/)) {
      if (s.length > 0) out.add(s);
    }
  }
  const scp = claims.scp;
  if (Array.isArray(scp)) {
    for (const s of scp) {
      if (typeof s === 'string' && s.length > 0) out.add(s);
    }
  } else if (typeof scp === 'string') {
    for (const s of scp.split(/\s+/)) {
      if (s.length > 0) out.add(s);
    }
  }
  return out;
}

/** Does scope `granted` satisfy requirement `required`? Handles `*`. */
export function scopeSatisfies(granted: string, required: string): boolean {
  if (granted === '*' || granted === required) return true;
  // 'orders:*' satisfies 'orders:read' but NOT 'users:read'
  if (granted.endsWith(':*')) {
    const prefix = granted.slice(0, -1); // 'orders:'
    return required.startsWith(prefix);
  }
  return false;
}

/** A permission → required scopes policy. ANY listed scope grants. */
export type ScopePolicy = Readonly<Record<string, readonly string[]>>;

export interface AuthzDecision {
  readonly allowed: boolean;
  /** Which granted scopes satisfied the permission. */
  readonly grantedBy: readonly string[];
  /** Required scopes the token was missing (when denied). */
  readonly missing: readonly string[];
}

export class ScopeAuthorizer {
  private readonly _policy: ScopePolicy;

  constructor(policy: ScopePolicy) {
    this._policy = policy;
  }

  /**
   * Can the token perform `permission`? When the permission isn't in the
   * policy, it's denied — closed-world authorization.
   */
  authorize(claims: TokenClaims2, permission: string): AuthzDecision {
    const required = this._policy[permission];
    if (!required) {
      return { allowed: false, grantedBy: [], missing: [] };
    }
    const scopes = tokenScopes(claims);
    const grantedBy = required.filter((req) => [...scopes].some((g) => scopeSatisfies(g, req)));
    if (grantedBy.length > 0) {
      return { allowed: true, grantedBy, missing: [] };
    }
    return { allowed: false, grantedBy: [], missing: required };
  }

  /** All permissions the token can perform. */
  permitted(claims: TokenClaims2): string[] {
    return Object.keys(this._policy).filter((p) => this.authorize(claims, p).allowed);
  }

  /**
   * Convenience boolean — throws nothing, just answers yes/no.
   * Unknown permission → false.
   */
  can(claims: TokenClaims2, permission: string): boolean {
    return this.authorize(claims, permission).allowed;
  }

  /** AND-check: all listed permissions must be allowed. */
  canAll(claims: TokenClaims2, permissions: readonly string[]): AuthzDecision {
    const missing: string[] = [];
    const grantedBy: string[] = [];
    for (const p of permissions) {
      const d = this.authorize(claims, p);
      if (d.allowed) grantedBy.push(...d.grantedBy);
      else missing.push(...(d.missing.length > 0 ? d.missing : [p]));
    }
    return { allowed: missing.length === 0, grantedBy, missing };
  }

  /** OR-check: at least one permission must be allowed. */
  canAny(claims: TokenClaims2, permissions: readonly string[]): AuthzDecision {
    for (const p of permissions) {
      const d = this.authorize(claims, p);
      if (d.allowed) return d;
    }
    return { allowed: false, grantedBy: [], missing: [...permissions] };
  }
}
