/**
 * Tenant Isolation Verifier
 *
 * Continuous leak detector: wraps a tenant-scoped data store and
 * verifies that every read returns data owned by the requesting
 * tenant. Any cross-tenant read that *succeeds* is recorded as an
 * {@link IsolationLeak} — the "tenant A saw tenant B's data" smoking
 * gun.
 *
 * Two verification modes:
 * - **Online**: {@link checkedRead} wraps actual data access — every
 *   read is validated before data reaches the caller, and a leak both
 *   records the incident and refuses the data (fail closed).
 * - **Audit**: {@link probe} simulates an access attempt without
 *   returning data — used by scanners that deliberately try
 *   cross-tenant reads to verify isolation holds.
 *
 * Resource ownership is tracked in an internal registry populated by
 * {@link registerResource}; reads of unregistered resources are denied
 * by default (closed-world assumption) unless `allowUnknown` is set.
 *
 * Complexity: ownership lookups are O(1) Map reads; {@link leaksFor}
 * is O(L) in the leak log length.
 *
 * @module MultiTenancyLayer/Engine2
 */

import { AccessProbe, IClock, IsolationLeak, SystemClock } from './types';

export interface IsolationVerifierOptions {
  clock?: IClock;
  /**
   * When true, reads of resources not registered to any owner are
   * permitted. Default false — closed-world.
   */
  allowUnknown?: boolean;
}

export class IsolationVerifier {
  /** resourceId -> ownerTenantId. */
  private readonly _owners: Map<string, string>;
  private readonly _probes: AccessProbe[];
  private readonly _leaks: IsolationLeak[];
  private readonly _clock: IClock;
  private readonly _allowUnknown: boolean;

  constructor(options: IsolationVerifierOptions = {}) {
    this._owners = new Map();
    this._probes = [];
    this._leaks = [];
    this._clock = options.clock ?? new SystemClock();
    this._allowUnknown = options.allowUnknown ?? false;
  }

  /** Register `resourceId` as owned by `ownerTenantId`. Re-registers on move. */
  registerResource(resourceId: string, ownerTenantId: string): void {
    this._owners.set(resourceId, ownerTenantId);
  }

  /** Remove a resource from the registry (deleted data). */
  unregisterResource(resourceId: string): void {
    this._owners.delete(resourceId);
  }

  ownerOf(resourceId: string): string | null {
    return this._owners.get(resourceId) ?? null;
  }

  /**
   * Validate a read before returning data to the caller.
   *
   * Returns true when `readerTenantId` may see `resourceId`. A denied
   * cross-tenant access is normal isolation behaviour and is logged as
   * a probe only; a *successful* cross-tenant access (which should be
   * impossible if callers respect this check) is a leak.
   *
   * The `dataWasReturned` flag models the reality that the verifier
   * usually observes the outcome: pass `true` if the read actually
   * produced data for the wrong tenant.
   */
  checkedRead(readerTenantId: string, resourceId: string, dataWasReturned: boolean): boolean {
    const owner = this._owners.get(resourceId);
    const now = this._clock.now();

    if (owner === undefined) {
      const allowed = this._allowUnknown || readerTenantId === undefined;
      this._probes.push({
        actorTenantId: readerTenantId,
        ownerTenantId: '(unregistered)',
        resourceId,
        succeeded: allowed && dataWasReturned,
        at: now,
      });
      return allowed;
    }

    const crossTenant = owner !== readerTenantId;
    const succeeded = dataWasReturned;
    this._probes.push({
      actorTenantId: readerTenantId,
      ownerTenantId: owner,
      resourceId,
      succeeded,
      at: now,
    });

    if (crossTenant && succeeded) {
      this._leaks.push({
        actorTenantId: readerTenantId,
        ownerTenantId: owner,
        resourceId,
        at: now,
        severity: 'critical',
      });
      // Fail closed — the caller must NOT receive this data.
      return false;
    }
    return !crossTenant;
  }

  /**
   * Simulated cross-tenant probe for audit scans — identical validation
   * but records the attempt even when no data was fetched.
   */
  probe(actorTenantId: string, resourceId: string): boolean {
    return this.checkedRead(actorTenantId, resourceId, true);
  }

  /** All confirmed leaks, oldest first. */
  leaks(): readonly IsolationLeak[] {
    return this._leaks;
  }

  /** Leaks where `tenantId` was the *victim* (its data was exposed). */
  leaksFor(tenantId: string): IsolationLeak[] {
    return this._leaks.filter((l) => l.ownerTenantId === tenantId);
  }

  /** Leaks where `tenantId` was the *actor* (it saw foreign data). */
  leaksBy(tenantId: string): IsolationLeak[] {
    return this._leaks.filter((l) => l.actorTenantId === tenantId);
  }

  /** Every recorded access probe. */
  probes(): readonly AccessProbe[] {
    return this._probes;
  }

  /**
   * Denied cross-tenant attempts — isolation working as intended, but
   * a high count from one actor suggests attempted traversal attacks.
   */
  deniedAttempts(actorTenantId: string): AccessProbe[] {
    return this._probes.filter(
      (p) => p.actorTenantId === actorTenantId && p.ownerTenantId !== actorTenantId && !p.succeeded
    );
  }
}
