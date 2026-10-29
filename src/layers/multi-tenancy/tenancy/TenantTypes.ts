/**
 * Multi-Tenancy — Core Types
 *
 * Contracts for tenant context, resolution, configuration overlay,
 * isolation models, quotas and lifecycle.
 *
 * @module MultiTenancy/Tenancy
 */

/** Injectable clock — epoch ms. */
export type TenancyClock = () => number;

/**
 * The ambient tenant context — what `TenantContext.run` establishes and
 * downstream code reads via `TenantContext.current()`.
 */
export interface TenantContextInfo {
  readonly tenantId: string;
  /** How the tenant was resolved — for debugging / audit. */
  readonly resolvedBy: 'subdomain' | 'header' | 'token' | 'explicit' | 'default';
  /** Resolution-time extras (e.g. JWT claims, host header). */
  readonly attributes?: Readonly<Record<string, string>>;
}

export class TenantError extends Error {
  readonly code: TenantErrorCode;
  constructor(code: TenantErrorCode, message: string) {
    super(message);
    this.name = 'TenantError';
    this.code = code;
  }
}

export enum TenantErrorCode {
  NO_CONTEXT = 'NO_CONTEXT',
  NOT_FOUND = 'NOT_FOUND',
  SUSPENDED = 'SUSPENDED',
  PURGED = 'PURGED',
  CROSS_TENANT = 'CROSS_TENANT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INVALID_ID = 'INVALID_ID',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
}

/** Tenant lifecycle states — a state machine, not just a flag. */
export enum TenantStatus {
  /** Being set up — not yet routable. */
  PROVISIONING = 'PROVISIONING',
  /** Fully live. */
  ACTIVE = 'ACTIVE',
  /** Access blocked but data retained (billing lapse, admin action). */
  SUSPENDED = 'SUSPENDED',
  /** Deletion in progress — hard-blocked, data may be gone. */
  PURGING = 'PURGING',
  /** Fully deleted — tombstone kept for idempotency. */
  PURGED = 'PURGED',
}

/** Allowed transitions (PURGED is terminal). */
export const TENANT_TRANSITIONS: Readonly<Record<TenantStatus, ReadonlyArray<TenantStatus>>> = {
  [TenantStatus.PROVISIONING]: [TenantStatus.ACTIVE, TenantStatus.PURGING],
  [TenantStatus.ACTIVE]: [TenantStatus.SUSPENDED, TenantStatus.PURGING],
  [TenantStatus.SUSPENDED]: [TenantStatus.ACTIVE, TenantStatus.PURGING],
  [TenantStatus.PURGING]: [TenantStatus.PURGED],
  [TenantStatus.PURGED]: [],
};

/** A registered tenant. */
export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly status: TenantStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Subdomains that resolve to this tenant (`acme` → acme.api.host). */
  readonly subdomains?: ReadonlyArray<string>;
  /** Config overlay — flat path → value merged over shared defaults. */
  readonly configOverlay?: Readonly<Record<string, string | number | boolean>>;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** A minimal request abstraction for resolution strategies. */
export interface TenantResolutionRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Host header split out (Host: acme.api.example.com). */
  readonly host?: string;
  /** Decoded token claims if the transport already authenticated. */
  readonly tokenClaims?: Readonly<Record<string, unknown>>;
  readonly query?: Readonly<Record<string, string | string[] | undefined>>;
}

/** Resolution strategies — first hit wins in a composite. */
export interface TenantResolver {
  readonly name: TenantContextInfo['resolvedBy'];
  resolve(req: TenantResolutionRequest): string | undefined;
}

/** Per-tenant quota limits. */
export interface TenantQuota {
  /** Requests per window. */
  readonly requestsPerWindow?: number;
  readonly windowMs?: number;
  /** Storage cap in bytes. */
  readonly maxStorageBytes?: number;
  /** Concurrent operations cap. */
  readonly maxConcurrentOps?: number;
}

export interface QuotaUsage {
  requestsInWindow: number;
  windowStartedAt: number;
  concurrentOps: number;
  storageBytes: number;
}
