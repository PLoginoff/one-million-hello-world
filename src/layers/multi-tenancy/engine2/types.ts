/**
 * Multi-Tenancy Engine2 — shared types.
 *
 * Type definitions for the tenant-operations module: atomic tenant
 * provisioning with compensating rollback, per-tenant usage metering,
 * cross-tenant isolation leak detection, tier/limit management, and
 * audited super-admin access.
 *
 * @module MultiTenancyLayer/Engine2
 */

/** Injectable clock. */
export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

/** Mutable test clock. */
export class TestClock implements IClock {
  private _current: number;
  constructor(start: number = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
  set(ms: number): void {
    this._current = ms;
  }
}

// ---------------------------------------------------------------------------
// Tiers & provisioning
// ---------------------------------------------------------------------------

/** A tenant tier — the limit bundle applied to a tenant. */
export interface TenantTier {
  id: string;
  name: string;
  /** resource name -> monthly/period quota; Infinity = unlimited. */
  limits: Readonly<Record<string, number>>;
  /** Max seats/users allowed. */
  maxUsers: number;
  /** Monthly price in cents (informational). */
  priceCents: number;
}

export enum TenantStatus {
  Provisioning = 'provisioning',
  Active = 'active',
  Suspended = 'suspended',
  Deprovisioning = 'deprovisioning',
  Deleted = 'deleted',
}

/** A provisioned tenant record. */
export interface Tenant {
  id: string;
  name: string;
  tierId: string;
  status: TenantStatus;
  createdAt: number;
  /** Arbitrary metadata (region, owner, etc.). */
  metadata: Readonly<Record<string, string>>;
  /** Names of resources created during provisioning. */
  resources: string[];
}

// ---------------------------------------------------------------------------
// Usage metering
// ---------------------------------------------------------------------------

/** One metered consumption event. */
export interface UsageEvent {
  tenantId: string;
  /** Metered resource name, e.g. "api-calls", "storage-mb", "seats". */
  resource: string;
  quantity: number;
  at: number;
}

/** Aggregated usage for a tenant in one billing period. */
export interface TenantUsageSummary {
  tenantId: string;
  periodStart: number;
  periodEnd: number;
  /** resource -> total consumed in the period. */
  totals: Readonly<Record<string, number>>;
  /** resource -> quota exceeded flag (vs. the tenant's tier limits). */
  overages: Readonly<Record<string, boolean>>;
}

// ---------------------------------------------------------------------------
// Isolation verification
// ---------------------------------------------------------------------------

/** One cross-tenant data-access attempt recorded by the verifier. */
export interface AccessProbe {
  /** Tenant whose context performed the access. */
  actorTenantId: string;
  /** Tenant that owns the resource. */
  ownerTenantId: string;
  /** Resource identifier probed. */
  resourceId: string;
  /** Whether the access returned data. */
  succeeded: boolean;
  at: number;
}

/** A confirmed isolation leak. */
export interface IsolationLeak {
  actorTenantId: string;
  ownerTenantId: string;
  resourceId: string;
  at: number;
  severity: 'critical' | 'high';
}

// ---------------------------------------------------------------------------
// Cross-tenant admin
// ---------------------------------------------------------------------------

/** Audit record for a super-admin access. */
export interface AdminAccessRecord {
  id: string;
  adminId: string;
  tenantId: string;
  action: string;
  /** Mandatory justification — empty reasons are rejected. */
  reason: string;
  at: number;
  /** How long the grant is valid, ms. */
  durationMs: number;
  /** Epoch ms the grant expires. */
  expiresAt: number;
}
