/**
 * Cross-Tenant Admin (break-glass super-admin access)
 *
 * Grants and audits time-boxed super-admin access to tenant data.
 * "Super-admin" here is deliberately NOT ambient — every access is:
 * - time-boxed (grants expire; {@link canAccess} checks expiry),
 * - justified (a non-empty reason is mandatory),
 * - audited (an immutable record per grant and per use).
 *
 * This models the support/engineering pattern where a platform
 * operator can enter a tenant context for a bounded window under a
 * ticket/incident reference, with a full trail for compliance review.
 *
 * Grants live in a Map keyed by `${adminId}:${tenantId}` — one active
 * grant per (admin, tenant) pair; re-granting refreshes the window.
 *
 * @module MultiTenancyLayer/Engine2
 */

import { AdminAccessRecord, IClock, SystemClock } from './types';

let grantSeq = 0;
function nextGrantId(): string {
  grantSeq += 1;
  return `grant-${grantSeq.toString(36)}`;
}

export class CrossTenantAdmin {
  /** `${adminId}${tenantId}` -> active grant. */
  private readonly _grants: Map<string, AdminAccessRecord>;
  /** Full audit history including expired/revoked grants. */
  private readonly _audit: AdminAccessRecord[];
  private readonly _clock: IClock;
  /** Grants used to actually access tenant data, for reporting. */
  private readonly _uses: Array<{ grantId: string; action: string; at: number }>;

  constructor(clock: IClock = new SystemClock()) {
    this._grants = new Map();
    this._audit = [];
    this._uses = [];
    this._clock = clock;
  }

  /**
   * Grant `adminId` access to `tenantId` for `durationMs`.
   * A non-empty `reason` (ticket link, incident id) is REQUIRED —
   * unjustified cross-tenant access is a policy violation.
   */
  grant(adminId: string, tenantId: string, action: string, reason: string, durationMs: number): AdminAccessRecord {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Cross-tenant admin access requires a non-empty reason');
    }
    if (durationMs <= 0) {
      throw new Error(`Grant duration must be positive, got ${durationMs}`);
    }
    const now = this._clock.now();
    const rec: AdminAccessRecord = {
      id: nextGrantId(),
      adminId,
      tenantId,
      action,
      reason: reason.trim(),
      at: now,
      durationMs,
      expiresAt: now + durationMs,
    };
    this._grants.set(`${adminId}${tenantId}`, rec);
    this._audit.push(rec);
    return rec;
  }

  /**
   * Does `adminId` hold a live grant for `tenantId`?
   * Expired grants are removed lazily on check.
   */
  canAccess(adminId: string, tenantId: string): boolean {
    const rec = this._grants.get(`${adminId}${tenantId}`);
    if (!rec) return false;
    if (this._clock.now() >= rec.expiresAt) {
      this._grants.delete(`${adminId}${tenantId}`);
      return false;
    }
    return true;
  }

  /**
   * Use a grant — records the access for audit. Returns false (and
   * records nothing) when no live grant exists; callers must treat a
   * false return as access denied.
   */
  access(adminId: string, tenantId: string, action: string): boolean {
    if (!this.canAccess(adminId, tenantId)) return false;
    const rec = this._grants.get(`${adminId}${tenantId}`)!;
    this._uses.push({ grantId: rec.id, action, at: this._clock.now() });
    return true;
  }

  /** Revoke a grant before expiry. */
  revoke(adminId: string, tenantId: string): boolean {
    return this._grants.delete(`${adminId}${tenantId}`);
  }

  /** Active (non-expired) grants, e.g. for a "who's in my data" page. */
  activeGrants(): AdminAccessRecord[] {
    const now = this._clock.now();
    const out: AdminAccessRecord[] = [];
    for (const [key, rec] of this._grants.entries()) {
      if (now >= rec.expiresAt) {
        this._grants.delete(key);
      } else {
        out.push(rec);
      }
    }
    return out;
  }

  /** Immutable audit history — all grants ever issued. */
  audit(): readonly AdminAccessRecord[] {
    return this._audit;
  }

  /** Every recorded use of a grant. */
  uses(): ReadonlyArray<{ grantId: string; action: string; at: number }> {
    return this._uses;
  }

  /** Grants issued for one tenant (victim-side view). */
  grantsFor(tenantId: string): AdminAccessRecord[] {
    return this._audit.filter((r) => r.tenantId === tenantId);
  }

  /** Grants issued to one admin (actor-side view). */
  grantsBy(adminId: string): AdminAccessRecord[] {
    return this._audit.filter((r) => r.adminId === adminId);
  }
}
