/**
 * Multi-Tenancy — public exports.
 */

export * from './TenantTypes';
export { TenantContext } from './TenantContext';
export {
  SubdomainResolver,
  HeaderResolver,
  TokenClaimResolver,
  QueryResolver,
  CompositeResolver,
} from './TenantResolvers';
export { TenantRegistry } from './TenantRegistry';
export type { ProvisionRequest } from './TenantRegistry';
export {
  TenantScopedStore,
  SchemaPerTenantResolver,
  requireTenantId,
  assertSameTenant,
} from './TenantIsolation';
export type { Row } from './TenantIsolation';
export { TenantQuotaManager } from './TenantQuotas';
export type { QuotaDecision } from './TenantQuotas';
export { TenancyMiddleware } from './TenantMiddleware';
export type { TenancyMiddlewareOptions } from './TenantMiddleware';
export { TenantResourcePool, TenantCache } from './TenantResourcePool';
export type { PoolOptions, PooledResource, TenantCacheOptions } from './TenantResourcePool';
