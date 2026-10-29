/**
 * Multi-Tenancy — Middleware Facade
 *
 * The pipeline glue: resolution → registry validation → quota check →
 * context establishment → handler. One call does a full tenant-aware
 * request dispatch:
 *
 *   handle(req, (ctx) => handler) =
 *     1. resolver chain extracts tenant id (or defaultTenant)
 *     2. registry.requireActive (SUSPENDED/PURGED/NOT_FOUND throw)
 *     3. quotas.consumeRequest (exceeded → TenantError QUOTA_EXCEEDED)
 *     4. TenantContext.run(ctx, handler)
 *
 * Also exposes `configFor(tenantId)` — per-tenant configuration overlay
 * merged over shared defaults.
 *
 * @module MultiTenancy/Tenancy
 */

import { TenantContext } from './TenantContext';
import { CompositeResolver } from './TenantResolvers';
import { TenantQuotaManager, QuotaDecision } from './TenantQuotas';
import { TenantRegistry } from './TenantRegistry';
import {
  Tenant,
  TenantContextInfo,
  TenantError,
  TenantErrorCode,
  TenantResolutionRequest,
  TenancyClock,
} from './TenantTypes';
import { ConfigValue } from '../../configuration/engine/ConfigTypes';
import { deepMerge, flattenTree, setPath } from '../../configuration/engine/ConfigMerger';

export interface TenancyMiddlewareOptions {
  readonly registry: TenantRegistry;
  readonly resolvers: CompositeResolver;
  readonly quotas?: TenantQuotaManager;
  /** Shared configuration defaults (nested object). */
  readonly baseConfig?: Record<string, ConfigValue>;
  /** When resolution finds nothing: 'reject' or the id of a default tenant. */
  readonly defaultTenant?: string;
  readonly clock?: TenancyClock;
}

export class TenancyMiddleware {
  private readonly _registry: TenantRegistry;
  private readonly _resolvers: CompositeResolver;
  private readonly _quotas: TenantQuotaManager | undefined;
  private readonly _baseConfig: Record<string, ConfigValue>;
  private readonly _defaultTenant: string | undefined;
  private readonly _clock: TenancyClock;

  constructor(options: TenancyMiddlewareOptions) {
    this._registry = options.registry;
    this._resolvers = options.resolvers;
    this._quotas = options.quotas;
    this._baseConfig = options.baseConfig ?? {};
    this._defaultTenant = options.defaultTenant;
    this._clock = options.clock ?? Date.now;
  }

  get registry(): TenantRegistry {
    return this._registry;
  }

  get quotas(): TenantQuotaManager | undefined {
    return this._quotas;
  }

  /**
   * Resolve + validate the tenant for a request, run `handler` inside the
   * tenant context. Returns whatever the handler returns (usually a Promise).
   */
  handle<T>(req: TenantResolutionRequest, handler: (ctx: TenantContextInfo, tenant: Tenant) => T): T {
    const resolved = this._resolvers.resolve(req);
    const tenantId = resolved?.tenantId ?? this._defaultTenant;
    if (tenantId === undefined) {
      throw new TenantError(TenantErrorCode.NOT_FOUND, 'could not resolve tenant from request');
    }
    const tenant = this._registry.requireActive(tenantId);

    if (this._quotas) {
      const decision = this._quotas.consumeRequest(tenantId);
      if (!decision.allowed) {
        throw new TenantError(
          TenantErrorCode.QUOTA_EXCEEDED,
          `tenant '${tenantId}' ${decision.reason ?? 'quota exceeded'} (retry in ${decision.retryAfterMs ?? 0}ms)`
        );
      }
    }

    const ctx: TenantContextInfo = {
      tenantId,
      resolvedBy: resolved?.resolvedBy ?? 'default',
      ...(req.host !== undefined ? { attributes: { host: req.host } } : {}),
    };
    return TenantContext.run(ctx, () => handler(ctx, tenant));
  }

  /**
   * The tenant's effective config: shared base + tenant overlay. Overlay is
   * a flat path map applied over the nested base — tenant values win.
   */
  configFor(tenantId: string): Record<string, ConfigValue> {
    const tenant = this._registry.require(tenantId);
    const overlay = tenant.configOverlay ?? {};
    const merged = deepMerge({ ...this._baseConfig }, {});
    for (const path of Object.keys(overlay)) {
      setPath(merged, path, overlay[path]);
    }
    return merged;
  }

  /** Flat view of a tenant's effective config (path → value). */
  flatConfigFor(tenantId: string): Record<string, ConfigValue> {
    return flattenTree(this.configFor(tenantId));
  }

  /** Admission check without consuming (rate-limit headers). */
  admission(tenantId: string): QuotaDecision | undefined {
    return this._quotas?.checkRequest(tenantId);
  }
}
