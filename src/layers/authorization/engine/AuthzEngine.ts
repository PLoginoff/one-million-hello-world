/**
 * Authorization Engine
 *
 * Unified evaluator implementing deny-overrides combining:
 *
 *   decision = NOT anyDeny AND anyAllow
 *
 * Allow sources evaluated (each records a reason + source tag):
 *   1. Direct subject deny/allow grants
 *   2. Role permissions (hierarchy-resolved)
 *   3. ABAC policies (conditions on subject/resource/environment)
 *   4. Ownership rules (owner implicitly allowed for `ownablePerms`)
 *   5. Delegations (non-expired, covering grant)
 *
 * Deny sources always evaluated first and short-circuit:
 *   - direct deny grants matching the needed permission
 *   - ABAC policies with effect=deny whose conditions hold
 *
 * Results are cached in DecisionCache keyed by
 * (subject, resource, action, environment) and stamped with the
 * engine graph version; any role/policy/delegation write bumps the
 * version and invalidates stale entries lazily.
 *
 * @module AuthorizationLayer/Engine
 */

import {
  AccessDecision,
  AccessRequest,
  AttributePolicy,
  AuthzClock,
  DecisionSource,
  Delegation,
  Permission,
  PermissionDiff,
  Resource,
  Role,
  Subject,
  SystemAuthzClock,
} from './types';
import {
  RbacResolver,
  permissionMatches,
  diffPermissions,
} from './RbacResolver';
import { AbacEvaluator } from './AbacEvaluator';
import { DecisionCache, decisionKey } from './DecisionCache';
import { DelegationRegistry, DelegationRequest } from './DelegationRegistry';

export interface AuthzEngineConfig {
  readonly clock?: AuthzClock;
  readonly cache?: { capacity?: number; ttlMs?: number };
  /** Permissions implicitly granted to a resource owner. */
  readonly ownershipPermissions?: readonly Permission[];
  /** Disable the decision cache (testing/debug). */
  readonly disableCache?: boolean;
}

export class AuthzEngine {
  readonly rbac: RbacResolver;
  readonly abac: AbacEvaluator;
  readonly delegations: DelegationRegistry;
  readonly cache: DecisionCache;

  private _clock: AuthzClock;
  private _graphVersion: number;
  private _ownershipPermissions: readonly Permission[];
  private _cacheDisabled: boolean;
  private _subjects: Map<string, Subject>;
  private _resources: Map<string, Resource>;

  constructor(config?: AuthzEngineConfig) {
    this._clock = config?.clock ?? new SystemAuthzClock();
    this._graphVersion = 0;
    this._ownershipPermissions = config?.ownershipPermissions ?? ['*:own'];
    this._cacheDisabled = config?.disableCache ?? false;
    this.rbac = new RbacResolver();
    this.abac = new AbacEvaluator();
    this.delegations = new DelegationRegistry(this._clock);
    this.cache = new DecisionCache(config?.cache);
    this._subjects = new Map();
    this._resources = new Map();
  }

  // ---------- graph mutation (bumps version, invalidating cache) ----------

  registerRole(role: Role): void {
    this.rbac.registerRole(role);
    this._bump();
  }

  removeRole(roleId: string): boolean {
    const ok = this.rbac.removeRole(roleId);
    if (ok) this._bump();
    return ok;
  }

  registerPolicy(policy: AttributePolicy): void {
    this.abac.registerPolicy(policy);
    this._bump();
  }

  removePolicy(policyId: string): boolean {
    const ok = this.abac.removePolicy(policyId);
    if (ok) this._bump();
    return ok;
  }

  /** Register a subject for lookup by id (evaluate by id variants). */
  registerSubject(subject: Subject): void {
    this._subjects.set(subject.id, subject);
    this.cache.invalidateSubject(subject.id);
  }

  registerResource(resource: Resource): void {
    this._resources.set(resource.id, resource);
    this.cache.invalidateResource(resource.id);
  }

  getSubject(id: string): Subject | undefined {
    return this._subjects.get(id);
  }

  getResource(id: string): Resource | undefined {
    return this._resources.get(id);
  }

  /** Create a delegation (validates grantor holds the permissions). */
  delegate(req: DelegationRequest): Delegation {
    const grantor = this._subjects.get(req.grantorId);
    if (!grantor) throw new Error(`unknown grantor ${req.grantorId}`);
    const eff = this.rbac.effectivePermissions(grantor);
    for (const p of req.permissions) {
      const held = [...eff].some((held) => permissionMatches(held, p));
      if (!held) {
        throw new Error(`grantor lacks permission ${p} — cannot delegate`);
      }
    }
    const d = this.delegations.delegate(req);
    this._bump();
    return d;
  }

  revokeDelegation(delegationId: string): boolean {
    const ok = this.delegations.revoke(delegationId);
    if (ok) this._bump();
    return ok;
  }

  // ---------- evaluation ----------

  /**
   * Evaluate an access request. Deny-overrides: any matching deny
   * (grant or ABAC policy) forces `allowed=false` regardless of
   * allow sources.
   */
  evaluate(req: AccessRequest): AccessDecision {
    const env = req.environment ?? {};
    const key = decisionKey(req.subject.id, req.resource, req.action, env);
    const now = this._clock.now();

    if (!this._cacheDisabled) {
      const hit = this.cache.get(key, this._graphVersion, now);
      if (hit) return { ...hit, fromCache: true };
    }
    const decision = this._evaluateUncached(req);
    if (!this._cacheDisabled) {
      this.cache.set(key, decision, this._graphVersion, now);
    }
    return decision;
  }

  /** Convenience: evaluate by ids. */
  evaluateIds(
    subjectId: string,
    resourceId: string,
    action: string,
    environment?: Record<string, unknown>
  ): AccessDecision {
    const subject = this._subjects.get(subjectId);
    const resource = this._resources.get(resourceId);
    if (!subject || !resource) {
      return {
        allowed: false,
        effect: 'deny',
        reasons: ['unknown subject or resource'],
        sources: ['default-deny'],
      };
    }
    return this.evaluate({ subject, resource, action, environment });
  }

  private _evaluateUncached(req: AccessRequest): AccessDecision {
    const reasons: string[] = [];
    const sources = new Set<DecisionSource>();
    const needed: Permission = `${req.resource.type}:${req.action}`;

    // ---- DENY evaluation first (deny-overrides) ----
    const resolved = this.rbac.resolveSubject(req.subject);
    for (const denyPerm of resolved.deny) {
      if (permissionMatches(denyPerm, needed)) {
        return {
          allowed: false,
          effect: 'deny',
          reasons: [`direct deny grant ${denyPerm} matches ${needed}`],
          sources: ['direct-grant'],
        };
      }
    }

    const { denies: denyPolicies } = this.abac.evaluate(req);
    for (const m of denyPolicies) {
      if (m.permissions.some((p) => permissionMatches(p, needed) || p === '*')) {
        return {
          allowed: false,
          effect: 'deny',
          reasons: [`ABAC deny policy ${m.policy.id} matches`],
          sources: ['abac-policy'],
        };
      }
    }

    // ---- ALLOW evaluation ----
    let allowed = false;

    // (a) direct allow grants
    for (const grant of req.subject.grants ?? []) {
      if (grant.effect === 'deny') continue;
      if (permissionMatches(grant.permission, needed)) {
        allowed = true;
        sources.add('direct-grant');
        reasons.push(`direct grant ${grant.permission} allows ${needed}`);
      }
    }

    // (b) role permissions
    for (const p of resolved.allow) {
      if (permissionMatches(p, needed)) {
        allowed = true;
        sources.add('role');
        reasons.push(`role permission ${p} allows ${needed}`);
        break;
      }
    }

    // (c) ABAC allow policies
    const { allows } = this.abac.evaluate(req);
    for (const m of allows) {
      if (m.permissions.some((p) => permissionMatches(p, needed) || p === '*')) {
        allowed = true;
        sources.add('abac-policy');
        reasons.push(`ABAC policy ${m.policy.id} allows ${needed}`);
      }
    }

    // (d) ownership: owner gets the configured ownable permissions
    if (
      req.resource.ownerId !== undefined &&
      req.resource.ownerId === req.subject.id
    ) {
      const ownNeeded = `${req.resource.type}:own`;
      const covered =
        this._ownershipPermissions.some(
          (p) => permissionMatches(p, ownNeeded) || permissionMatches(p, needed)
        ) || this._ownershipPermissions.some((p) => p === '*');
      if (covered) {
        allowed = true;
        sources.add('ownership');
        reasons.push(`subject owns resource ${req.resource.id}`);
      }
    }

    // (e) delegations held by the subject
    const dlg = this.delegations.delegatedPermissions(
      req.subject.id,
      needed,
      req.resource.type,
      req.resource.id
    );
    if (dlg.delegations.length > 0) {
      // additionally require the grantor to still hold the permission
      const valid = dlg.delegations.filter((d) => {
        const grantor = this._subjects.get(d.grantorId);
        if (!grantor) return false;
        const eff = this.rbac.effectivePermissions(grantor);
        return d.permissions.some((p) =>
          [...eff].some((held) => permissionMatches(held, p))
        );
      });
      if (valid.length > 0) {
        allowed = true;
        sources.add('delegation');
        reasons.push(
          `delegation(s) ${valid.map((d) => d.id).join(',')} allow ${needed}`
        );
      }
    }

    if (!allowed) {
      sources.add('default-deny');
      reasons.push(`no allow source matched ${needed}`);
    }
    return {
      allowed,
      effect: allowed ? 'allow' : 'deny',
      reasons,
      sources: [...sources],
    };
  }

  /**
   * Can `subject` perform `action` on `resource`? Boolean shortcut.
   */
  can(req: AccessRequest): boolean {
    return this.evaluate(req).allowed;
  }

  /**
   * All actions a subject can perform on a resource type, derived by
   * intersecting effective permissions (RBAC only — ABAC/ownership
   * need concrete resources). Returns matching permissions.
   */
  permittedOn(subject: Subject, resourceType: string): Permission[] {
    const eff = this.rbac.effectivePermissions(subject);
    return [...eff].filter((p) => {
      const first = p.split(':')[0];
      return first === resourceType || first === '*';
    });
  }

  /**
   * Diff effective permissions of two subjects or two role sets.
   */
  diffSubjects(a: Subject, b: Subject): PermissionDiff {
    const pa = this.rbac.effectivePermissions(a);
    const pb = this.rbac.effectivePermissions(b);
    return diffPermissions([...pa], [...pb]);
  }

  diffRoleSets(roleIdsA: readonly string[], roleIdsB: readonly string[]): PermissionDiff {
    return diffPermissions(
      this._collectPerms(roleIdsA),
      this._collectPerms(roleIdsB)
    );
  }

  private _collectPerms(roleIds: readonly string[]): Permission[] {
    const out = new Set<Permission>();
    for (const id of roleIds) {
      for (const p of this.rbac.resolveRole(id)) out.add(p);
    }
    return [...out];
  }

  /** Current graph version (for diagnostics). */
  get graphVersion(): number {
    return this._graphVersion;
  }

  private _bump(): void {
    this._graphVersion++;
  }
}
