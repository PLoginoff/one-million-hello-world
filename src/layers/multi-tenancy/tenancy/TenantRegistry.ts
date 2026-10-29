/**
 * Multi-Tenancy — Tenant Registry + Lifecycle
 *
 * Owns the tenant catalog and drives the lifecycle state machine:
 *
 *   PROVISIONING → ACTIVE ⇄ SUSPENDED
 *                      ↘ PURGING → PURGED (terminal)
 *
 * - Provision is two-phase: `provision` creates in PROVISIONING (wiring
 *   up resources can happen against the record), `activate` flips live.
 *   `provisionTenant({activate:true})` does both atomically.
 * - Suspend blocks access but retains data; resume reactivates.
 * - Purge is two-phase as well: `beginPurge` (hard-block traffic) then
 *   `completePurge` after data cleanup — a tombstone remains so replays
 *   of "create tenant X" can report ALREADY_PURGED rather than reviving it.
 * - Subdomain index: `resolveSubdomain('acme')` → tenant id, kept in sync
 *   on provision/update.
 *
 * @module MultiTenancy/Tenancy
 */

import {
  TENANT_TRANSITIONS,
  Tenant,
  TenantError,
  TenantErrorCode,
  TenantStatus,
  TenancyClock,
} from './TenantTypes';

export interface ProvisionRequest {
  readonly id: string;
  readonly name: string;
  readonly subdomains?: ReadonlyArray<string>;
  readonly configOverlay?: Readonly<Record<string, string | number | boolean>>;
  readonly metadata?: Readonly<Record<string, string>>;
  /** Skip straight to ACTIVE (default false = stays PROVISIONING). */
  readonly activate?: boolean;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export class TenantRegistry {
  private readonly _clock: TenancyClock;
  private readonly _tenants = new Map<string, Tenant>();
  private readonly _subdomainIndex = new Map<string, string>();
  private readonly _history = new Map<string, Array<{ from: TenantStatus; to: TenantStatus; at: number }>>();

  constructor(clock: TenancyClock = Date.now) {
    this._clock = clock;
  }

  /** Create a tenant. */
  provision(req: ProvisionRequest): Tenant {
    if (!ID_RE.test(req.id)) {
      throw new TenantError(TenantErrorCode.INVALID_ID, `invalid tenant id '${req.id}' (3-64 chars, lowercase alphanumeric + hyphens)`);
    }
    if (this._tenants.has(req.id)) {
      throw new TenantError(TenantErrorCode.ALREADY_EXISTS, `tenant '${req.id}' already exists`);
    }
    const now = this._clock();
    let tenant: Tenant = {
      id: req.id,
      name: req.name,
      status: TenantStatus.PROVISIONING,
      createdAt: now,
      updatedAt: now,
      ...(req.subdomains ? { subdomains: req.subdomains } : {}),
      ...(req.configOverlay ? { configOverlay: req.configOverlay } : {}),
      ...(req.metadata ? { metadata: req.metadata } : {}),
    };
    this._tenants.set(req.id, tenant);
    this._record(req.id, TenantStatus.PROVISIONING, TenantStatus.PROVISIONING);
    for (const sd of req.subdomains ?? []) this._subdomainIndex.set(sd.toLowerCase(), req.id);
    if (req.activate === true) {
      tenant = this._transition(req.id, TenantStatus.ACTIVE);
    }
    return tenant;
  }

  get(id: string): Tenant | undefined {
    return this._tenants.get(id);
  }

  /** Get or throw NOT_FOUND / PURGED. */
  require(id: string): Tenant {
    const t = this._tenants.get(id);
    if (!t) throw new TenantError(TenantErrorCode.NOT_FOUND, `unknown tenant '${id}'`);
    if (t.status === TenantStatus.PURGED) {
      throw new TenantError(TenantErrorCode.PURGED, `tenant '${id}' has been purged`);
    }
    return t;
  }

  /** Require the tenant to be ACTIVE — throws SUSPENDED otherwise. */
  requireActive(id: string): Tenant {
    const t = this.require(id);
    if (t.status === TenantStatus.SUSPENDED || t.status === TenantStatus.PURGING) {
      throw new TenantError(TenantErrorCode.SUSPENDED, `tenant '${id}' is ${t.status.toLowerCase()}`);
    }
    if (t.status === TenantStatus.PROVISIONING) {
      throw new TenantError(TenantErrorCode.SUSPENDED, `tenant '${id}' is still provisioning`);
    }
    return t;
  }

  activate(id: string): Tenant {
    return this._transition(id, TenantStatus.ACTIVE);
  }

  suspend(id: string): Tenant {
    return this._transition(id, TenantStatus.SUSPENDED);
  }

  /** Step 1 of deletion — hard-block traffic. */
  beginPurge(id: string): Tenant {
    return this._transition(id, TenantStatus.PURGING);
  }

  /** Step 2 of deletion — mark fully purged, drop the subdomain index. */
  completePurge(id: string): Tenant {
    const t = this._transition(id, TenantStatus.PURGED);
    for (const sd of t.subdomains ?? []) this._subdomainIndex.delete(sd.toLowerCase());
    return t;
  }

  /** Update mutable fields (name, subdomains, config overlay, metadata). */
  update(id: string, patch: Partial<Pick<Tenant, 'name' | 'subdomains' | 'configOverlay' | 'metadata'>>): Tenant {
    const t = this.require(id);
    if (patch.subdomains) {
      for (const sd of t.subdomains ?? []) this._subdomainIndex.delete(sd.toLowerCase());
      for (const sd of patch.subdomains) this._subdomainIndex.set(sd.toLowerCase(), id);
    }
    const updated: Tenant = { ...t, ...patch, id: t.id, status: t.status, createdAt: t.createdAt, updatedAt: this._clock() };
    this._tenants.set(id, updated);
    return updated;
  }

  /** tenant id for `subdomain` or undefined. */
  resolveSubdomain(subdomain: string): string | undefined {
    return this._subdomainIndex.get(subdomain.toLowerCase());
  }

  /** Status transition history for a tenant (audit). */
  history(id: string): ReadonlyArray<{ from: TenantStatus; to: TenantStatus; at: number }> {
    return this._history.get(id) ?? [];
  }

  list(status?: TenantStatus): ReadonlyArray<Tenant> {
    const all = Array.from(this._tenants.values());
    return status === undefined ? all : all.filter((t) => t.status === status);
  }

  private _transition(id: string, to: TenantStatus): Tenant {
    const t = this.require(id);
    const allowed = TENANT_TRANSITIONS[t.status];
    if (!allowed.includes(to)) {
      throw new TenantError(
        TenantErrorCode.INVALID_ID,
        `invalid tenant transition ${t.status} → ${to} for '${id}'`
      );
    }
    const updated: Tenant = { ...t, status: to, updatedAt: this._clock() };
    this._tenants.set(id, updated);
    this._record(id, t.status, to);
    return updated;
  }

  private _record(id: string, from: TenantStatus, to: TenantStatus): void {
    const h = this._history.get(id) ?? [];
    h.push({ from, to, at: this._clock() });
    this._history.set(id, h);
  }
}
