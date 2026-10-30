/**
 * Tenant Tier Manager
 *
 * Manages tier changes (upgrades/downgrades) with limit-validation:
 * - Upgrade = moving to a tier with a strictly-higher `maxUsers` (or
 *   any larger resource limit). Downgrade requests validate that the
 *   tenant's CURRENT usage fits inside the new tier — you can't
 *   downgrade a tenant that's already over the smaller quota.
 * - Every change is recorded for audit.
 *
 * Usage data comes from {@link TenantMeter} so downgrade checks compare
 * live consumption against the target tier's limits.
 *
 * @module MultiTenancyLayer/Engine2
 */

import { IClock, SystemClock, TenantTier } from './types';
import { TenantMeter } from './TenantMeter';
import { TenantProvisioner } from './TenantProvisioner';

export interface TierChange {
  tenantId: string;
  fromTierId: string;
  toTierId: string;
  kind: 'upgrade' | 'downgrade';
  at: number;
}

/** Thrown when a downgrade would strand usage above the new limit. */
export class DowngradeBlockedError extends Error {
  readonly tenantId: string;
  readonly violations: Array<{ resource: string; used: number; newLimit: number }>;

  constructor(tenantId: string, violations: Array<{ resource: string; used: number; newLimit: number }>) {
    super(
      `Downgrade of ${tenantId} blocked: over new limits for ${violations
        .map((v) => `${v.resource} (${v.used} > ${v.newLimit})`)
        .join(', ')}`
    );
    this.name = 'DowngradeBlockedError';
    this.tenantId = tenantId;
    this.violations = violations;
  }
}

export class TierManager {
  private readonly _provisioner: TenantProvisioner;
  private readonly _meter: TenantMeter;
  private readonly _clock: IClock;
  private readonly _changes: TierChange[];

  constructor(provisioner: TenantProvisioner, meter: TenantMeter, clock: IClock = new SystemClock()) {
    this._provisioner = provisioner;
    this._meter = meter;
    this._clock = clock;
    this._changes = [];
  }

  /**
   * True when `to` is a strict upgrade over `from`: every limit is at
   * least as large AND at least one axis (maxUsers or any resource
   * limit) is strictly larger. A lateral or mixed move (more of A,
   * less of B) is treated as a downgrade for validation purposes — the
   * safe direction for capacity checks.
   */
  isUpgrade(from: TenantTier, to: TenantTier): boolean {
    if (from.id === to.id) return false;
    let anyStrictlyLarger = to.maxUsers > from.maxUsers;
    if (to.maxUsers < from.maxUsers) return false;

    const resources = new Set([...Object.keys(from.limits), ...Object.keys(to.limits)]);
    for (const r of resources) {
      const f = from.limits[r] ?? 0;
      const t = to.limits[r] ?? 0;
      if (t < f) return false; // reduces a limit — not an upgrade
      if (t > f) anyStrictlyLarger = true;
    }
    return anyStrictlyLarger;
  }

  /**
   * Change `tenantId` to `tierId`, validating downgrade constraints.
   * `periodStart` marks the start of the current billing period for
   * usage-vs-limit checks.
   */
  changeTier(tenantId: string, tierId: string, periodStart: number): TierChange {
    const tenant = this._provisioner.get(tenantId);
    if (!tenant) throw new Error(`Unknown tenant: ${tenantId}`);
    const from = this._provisioner.tierOf(tenantId);
    const to = this._tierOrThrow(tierId);
    const upgrade = this.isUpgrade(from, to);

    if (!upgrade) {
      // Downgrade (or lateral move): verify current usage fits.
      // periodEnd is exclusive so +1 includes events at `now`.
      const summary = this._meter.summarize(tenantId, periodStart, this._clock.now() + 1);
      const violations: Array<{ resource: string; used: number; newLimit: number }> = [];
      for (const [resource, used] of Object.entries(summary.totals)) {
        const newLimit = to.limits[resource];
        if (newLimit !== undefined && newLimit !== Infinity && used > newLimit) {
          violations.push({ resource, used, newLimit });
        }
      }
      if (violations.length > 0) throw new DowngradeBlockedError(tenantId, violations);
    }

    this._provisioner.setTier(tenantId, tierId);
    const change: TierChange = {
      tenantId,
      fromTierId: from.id,
      toTierId: tierId,
      kind: upgrade ? 'upgrade' : 'downgrade',
      at: this._clock.now(),
    };
    this._changes.push(change);
    return change;
  }

  /** Audit trail of every tier change. */
  changes(): readonly TierChange[] {
    return this._changes;
  }

  /**
   * Headroom report: for each metered resource, how much quota the
   * tenant has left this period. Useful for "upgrade prompts" — when
   * headroom approaches zero the tenant is a candidate for upsell.
   */
  headroom(tenantId: string, periodStart: number): Record<string, number> {
    const tier = this._provisioner.tierOf(tenantId);
    const summary = this._meter.summarize(tenantId, periodStart, this._clock.now() + 1);
    const out: Record<string, number> = {};
    for (const [resource, limit] of Object.entries(tier.limits)) {
      if (limit === Infinity) continue;
      const used = summary.totals[resource] ?? 0;
      out[resource] = Math.max(0, limit - used);
    }
    return out;
  }

  private _tierOrThrow(tierId: string): TenantTier {
    const tier = this._provisioner.tier(tierId);
    if (!tier) throw new Error(`Unknown tier: ${tierId}`);
    return tier;
  }
}
