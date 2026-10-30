/**
 * Tenant Usage Meter
 *
 * Records per-tenant resource consumption events and aggregates them
 * into billing-period summaries with tier-limit overage detection.
 *
 * Storage:
 * - `_events`: append-only log per tenant — O(1) record, O(E) summary
 *   where E = events in the period. Events are bucketed per tenant so
 *   one tenant's traffic never slows another's queries.
 * - Summaries are computed on demand — cheap enough for per-tenant
 *   event volumes typical of metering (≤ ~100k/period).
 *
 * The meter is deliberately storage-agnostic: events are kept in memory
 * and can be drained/exported for an external billing pipeline via
 * {@link drain}.
 *
 * @module MultiTenancyLayer/Engine2
 */

import {
  IClock,
  SystemClock,
  TenantTier,
  TenantUsageSummary,
  UsageEvent,
} from './types';
import { TenantProvisioner } from './TenantProvisioner';

export class TenantMeter {
  private readonly _events: Map<string, UsageEvent[]>;
  private readonly _provisioner: TenantProvisioner;
  private readonly _clock: IClock;

  constructor(provisioner: TenantProvisioner, clock: IClock = new SystemClock()) {
    this._events = new Map();
    this._provisioner = provisioner;
    this._clock = clock;
  }

  /** Record consumption of `quantity` units of `resource` by `tenantId`. */
  record(tenantId: string, resource: string, quantity: number): void {
    if (quantity <= 0) throw new Error(`Usage quantity must be positive, got ${quantity}`);
    // Validate the tenant exists — metering a ghost tenant is a bug.
    if (!this._provisioner.get(tenantId)) {
      throw new Error(`Unknown tenant: ${tenantId}`);
    }
    let log = this._events.get(tenantId);
    if (!log) {
      log = [];
      this._events.set(tenantId, log);
    }
    log.push({ tenantId, resource, quantity, at: this._clock.now() });
  }

  /**
   * Aggregate usage for `tenantId` in `[periodStart, periodEnd)` and
   * flag each resource that exceeded the tenant's tier quota.
   */
  summarize(tenantId: string, periodStart: number, periodEnd: number): TenantUsageSummary {
    const tier: TenantTier = this._provisioner.tierOf(tenantId);
    const totals: Record<string, number> = {};
    const log = this._events.get(tenantId) ?? [];
    for (const e of log) {
      if (e.at >= periodStart && e.at < periodEnd) {
        totals[e.resource] = (totals[e.resource] ?? 0) + e.quantity;
      }
    }
    const overages: Record<string, boolean> = {};
    for (const [resource, total] of Object.entries(totals)) {
      const limit = tier.limits[resource];
      overages[resource] = limit !== undefined && total > limit;
    }
    return { tenantId, periodStart, periodEnd, totals, overages };
  }

  /** Current-period consumption of one resource. */
  current(tenantId: string, resource: string, periodStart: number): number {
    const now = this._clock.now();
    const log = this._events.get(tenantId) ?? [];
    let total = 0;
    for (const e of log) {
      if (e.resource === resource && e.at >= periodStart && e.at <= now) total += e.quantity;
    }
    return total;
  }

  /**
   * Would recording `quantity` more of `resource` breach the tier limit?
   * Used by admission-control middleware to reject work early.
   */
  wouldExceed(tenantId: string, resource: string, quantity: number, periodStart: number): boolean {
    const tier = this._provisioner.tierOf(tenantId);
    const limit = tier.limits[resource];
    if (limit === undefined || limit === Infinity) return false;
    return this.current(tenantId, resource, periodStart) + quantity > limit;
  }

  /**
   * Remove and return all events for `tenantId` — for exporting to an
   * external billing system after period close.
   */
  drain(tenantId: string): UsageEvent[] {
    const log = this._events.get(tenantId) ?? [];
    this._events.delete(tenantId);
    return log;
  }

  /** Event count for a tenant (all periods). */
  eventCount(tenantId: string): number {
    return this._events.get(tenantId)?.length ?? 0;
  }
}
