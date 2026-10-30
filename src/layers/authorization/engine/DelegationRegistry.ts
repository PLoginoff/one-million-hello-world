/**
 * Delegation Registry
 *
 * Manages delegated permission grants: a grantor lends a subset of
 * their own permissions to a delegate for a bounded time, optionally
 * scoped to a resource type or a single resource.
 *
 * Invariant: a delegation may only grant permissions the grantor
 * actually holds at delegation time — the registry records the
 * granted set verbatim (the engine re-validates at evaluation).
 *
 * Delegations are indexed by delegate id for O(1) candidate lookup;
 * expiry is lazy (checked on read) plus an explicit `purgeExpired`.
 *
 * @module AuthorizationLayer/Engine
 */

import { Delegation, Permission, AuthzClock, SystemAuthzClock } from './types';
import { permissionMatches } from './RbacResolver';

export interface DelegationRequest {
  readonly grantorId: string;
  readonly delegateId: string;
  readonly permissions: readonly Permission[];
  readonly ttlMs: number;
  readonly resourceType?: string;
  readonly resourceId?: string;
}

export class DelegationRegistry {
  private _byDelegate: Map<string, Delegation[]>;
  private _byId: Map<string, Delegation>;
  private _clock: AuthzClock;
  private _seq: number;

  constructor(clock?: AuthzClock) {
    this._byDelegate = new Map();
    this._byId = new Map();
    this._clock = clock ?? new SystemAuthzClock();
    this._seq = 0;
  }

  /** Create a delegation. Returns the stored record. */
  delegate(req: DelegationRequest): Delegation {
    if (req.permissions.length === 0) {
      throw new Error('delegation requires at least one permission');
    }
    if (req.ttlMs <= 0) {
      throw new Error('delegation ttlMs must be positive');
    }
    this._seq++;
    const d: Delegation = {
      id: `dlg_${this._seq}`,
      grantorId: req.grantorId,
      delegateId: req.delegateId,
      permissions: [...req.permissions],
      resourceType: req.resourceType,
      resourceId: req.resourceId,
      createdAt: this._clock.now(),
      expiresAt: this._clock.now() + req.ttlMs,
    };
    this._byId.set(d.id, d);
    let list = this._byDelegate.get(d.delegateId);
    if (!list) {
      list = [];
      this._byDelegate.set(d.delegateId, list);
    }
    list.push(d);
    return d;
  }

  /** Revoke a delegation by id. */
  revoke(delegationId: string): boolean {
    const d = this._byId.get(delegationId);
    if (!d) return false;
    this._byId.delete(delegationId);
    const list = this._byDelegate.get(d.delegateId);
    if (list) {
      const i = list.findIndex((x) => x.id === delegationId);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) this._byDelegate.delete(d.delegateId);
    }
    return true;
  }

  /**
   * Active delegations a delegate may use for a resource.
   * Filters by expiry + optional resource scoping. O(#delegations).
   */
  activeFor(
    delegateId: string,
    resourceType: string,
    resourceId: string
  ): Delegation[] {
    const now = this._clock.now();
    const list = this._byDelegate.get(delegateId) ?? [];
    return list.filter(
      (d) =>
        d.expiresAt > now &&
        (d.resourceType === undefined || d.resourceType === resourceType) &&
        (d.resourceId === undefined || d.resourceId === resourceId)
    );
  }

  /**
   * Which delegated permissions cover `needed` for this delegate and
   * resource right now?
   */
  delegatedPermissions(
    delegateId: string,
    needed: Permission,
    resourceType: string,
    resourceId: string
  ): { permissions: Permission[]; delegations: Delegation[] } {
    const act = this.activeFor(delegateId, resourceType, resourceId);
    const perms = new Set<Permission>();
    const used: Delegation[] = [];
    for (const d of act) {
      const match = d.permissions.filter((p) => permissionMatches(p, needed));
      if (match.length > 0) {
        for (const m of match) perms.add(m);
        used.push(d);
      }
    }
    return { permissions: [...perms], delegations: used };
  }

  /** All delegations granted BY a subject (for audit). */
  grantedBy(grantorId: string): Delegation[] {
    return [...this._byId.values()].filter((d) => d.grantorId === grantorId);
  }

  /** All delegations held by a subject. */
  heldBy(delegateId: string): Delegation[] {
    return (this._byDelegate.get(delegateId) ?? []).slice();
  }

  /** Drop expired delegations. Returns count removed. */
  purgeExpired(): number {
    const now = this._clock.now();
    let n = 0;
    for (const [id, d] of [...this._byId]) {
      if (d.expiresAt <= now) {
        this.revoke(id);
        n++;
      }
    }
    return n;
  }

  size(): number {
    return this._byId.size;
  }
}
