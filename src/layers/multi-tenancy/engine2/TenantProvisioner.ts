/**
 * Tenant Provisioner
 *
 * Atomically creates a tenant and all of its required resources.
 * Provisioning runs as a saga: each registered {@link ProvisionStep}
 * contributes a `create` plus a compensating `rollback`; when any step
 * fails, completed steps are rolled back in reverse order (LIFO) and
 * the tenant record is removed — callers never observe a half-created
 * tenant.
 *
 * Steps run sequentially because later steps typically depend on
 * earlier ones (e.g. "create schema" before "seed admin user").
 *
 * Failure semantics:
 * - A step that throws after partially completing is still rolled back
 *   via its compensator — compensators must be idempotent.
 * - If a compensator itself throws, the failure is recorded on the
 *   thrown `ProvisioningError.rollbackErrors` but rollback continues —
 *   we never leave a tenant record behind even when cleanup is partial.
 *
 * @module MultiTenancyLayer/Engine2
 */

import { IClock, SystemClock, Tenant, TenantStatus, TenantTier } from './types';

/** One unit of provisioning work + its compensation. */
export interface ProvisionStep {
  /** Step name — becomes an entry on `Tenant.resources`. */
  name: string;
  create: (tenant: Tenant) => void | Promise<void>;
  rollback: (tenant: Tenant) => void | Promise<void>;
}

/** Thrown when provisioning fails; carries compensator failures. */
export class ProvisioningError extends Error {
  readonly tenantId: string;
  readonly failedStep: string;
  readonly rollbackErrors: Error[];

  constructor(tenantId: string, failedStep: string, cause: Error, rollbackErrors: Error[]) {
    super(`Provisioning ${tenantId} failed at step "${failedStep}": ${cause.message}`);
    this.name = 'ProvisioningError';
    this.tenantId = tenantId;
    this.failedStep = failedStep;
    this.rollbackErrors = rollbackErrors;
  }
}

let tenantSeq = 0;
function nextTenantId(): string {
  tenantSeq += 1;
  return `t-${tenantSeq.toString(36)}`;
}

export class TenantProvisioner {
  private readonly _tenants: Map<string, Tenant>;
  private readonly _steps: ProvisionStep[];
  private readonly _tiers: Map<string, TenantTier>;
  private readonly _clock: IClock;

  /**
   * @param tiers  available tiers — provisioning requires a valid tierId
   * @param steps  ordered provisioning steps
   */
  constructor(
    tiers: readonly TenantTier[],
    steps: readonly ProvisionStep[],
    clock: IClock = new SystemClock()
  ) {
    this._tenants = new Map();
    this._steps = [...steps];
    this._tiers = new Map(tiers.map((t) => [t.id, t]));
    this._clock = clock;
  }

  /**
   * Create a tenant atomically. Runs every step in order; on failure
   * compensates completed steps in reverse and removes the record.
   */
  async provision(
    name: string,
    tierId: string,
    metadata: Record<string, string> = {}
  ): Promise<Tenant> {
    const tier = this._tiers.get(tierId);
    if (!tier) throw new Error(`Unknown tier: ${tierId}`);

    const tenant: Tenant = {
      id: nextTenantId(),
      name,
      tierId,
      status: TenantStatus.Provisioning,
      createdAt: this._clock.now(),
      metadata,
      resources: [],
    };
    this._tenants.set(tenant.id, tenant);

    const completed: ProvisionStep[] = [];
    try {
      for (const step of this._steps) {
        await step.create(tenant);
        completed.push(step);
        tenant.resources.push(step.name);
      }
    } catch (err) {
      // Compensate in reverse order — LIFO.
      const rollbackErrors: Error[] = [];
      for (let i = completed.length - 1; i >= 0; i--) {
        try {
          await completed[i]!.rollback(tenant);
        } catch (rbErr) {
          rollbackErrors.push(rbErr instanceof Error ? rbErr : new Error(String(rbErr)));
        }
      }
      this._tenants.delete(tenant.id);
      const cause = err instanceof Error ? err : new Error(String(err));
      const stepName = this._steps[completed.length]?.name ?? 'unknown';
      throw new ProvisioningError(tenant.id, stepName, cause, rollbackErrors);
    }

    tenant.status = TenantStatus.Active;
    return tenant;
  }

  /** Fetch a tenant; null when absent. */
  get(tenantId: string): Tenant | null {
    return this._tenants.get(tenantId) ?? null;
  }

  /** All live (non-deleted) tenants. */
  list(): Tenant[] {
    return Array.from(this._tenants.values());
  }

  /** Suspend a tenant — it stays visible but is marked inactive. */
  suspend(tenantId: string): Tenant {
    const t = this._require(tenantId);
    if (t.status !== TenantStatus.Active) {
      throw new Error(`Cannot suspend tenant ${tenantId} in status ${t.status}`);
    }
    t.status = TenantStatus.Suspended;
    return t;
  }

  /** Resume a suspended tenant. */
  resume(tenantId: string): Tenant {
    const t = this._require(tenantId);
    if (t.status !== TenantStatus.Suspended) {
      throw new Error(`Cannot resume tenant ${tenantId} in status ${t.status}`);
    }
    t.status = TenantStatus.Active;
    return t;
  }

  /**
   * Deprovision: run every step's rollback in reverse order, then delete
   * the record. Like provisioning, compensator failures don't abort.
   */
  async deprovision(tenantId: string): Promise<{ rollbackErrors: Error[] }> {
    const t = this._require(tenantId);
    t.status = TenantStatus.Deprovisioning;
    const rollbackErrors: Error[] = [];
    for (let i = this._steps.length - 1; i >= 0; i--) {
      try {
        await this._steps[i]!.rollback(t);
      } catch (err) {
        rollbackErrors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    this._tenants.delete(tenantId);
    t.status = TenantStatus.Deleted;
    return { rollbackErrors };
  }

  /** Look up a tier definition by id; null when unregistered. */
  tier(tierId: string): TenantTier | null {
    return this._tiers.get(tierId) ?? null;
  }

  /** All registered tiers. */
  tiers(): TenantTier[] {
    return Array.from(this._tiers.values());
  }

  /** The tier record for a tenant. */
  tierOf(tenantId: string): TenantTier {
    const t = this._require(tenantId);
    const tier = this._tiers.get(t.tierId);
    if (!tier) throw new Error(`Tenant ${tenantId} references missing tier ${t.tierId}`);
    return tier;
  }

  /** Update a tenant's tier (upgrade/downgrade). */
  setTier(tenantId: string, tierId: string): Tenant {
    if (!this._tiers.has(tierId)) throw new Error(`Unknown tier: ${tierId}`);
    const t = this._require(tenantId);
    t.tierId = tierId;
    return t;
  }

  /** Register a new tier at runtime. */
  addTier(tier: TenantTier): void {
    this._tiers.set(tier.id, tier);
  }

  private _require(tenantId: string): Tenant {
    const t = this._tenants.get(tenantId);
    if (!t) throw new Error(`Unknown tenant: ${tenantId}`);
    return t;
  }
}
