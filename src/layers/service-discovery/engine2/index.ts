/**
 * ServiceDiscovery Engine2 — public exports.
 *
 * @module ServiceDiscoveryLayer/Engine2
 */

export * from './types';
export { TtlDnsDiscovery, DnsError } from './TtlDnsDiscovery';
export type { DnsAnswer, DnsTransport, TtlDnsOptions } from './TtlDnsDiscovery';
export { HealthDeregistrator } from './HealthDeregistrator';
export type {
  DeregisterableRegistry,
  HealthDeregistratorOptions,
  HealthReport,
} from './HealthDeregistrator';
export { LocalRegistry, FederatedRegistry } from './FederatedRegistry';
export type { FederatedLookupOptions } from './FederatedRegistry';
export { DiscoveryMetrics } from './DiscoveryMetrics';
export type { DiscoveryMetricsOptions, DiscoveryStats } from './DiscoveryMetrics';
export { MeshSync, InMemoryMeshTransport } from './MeshSync';
export type { MeshUpdate, MeshTransport, SidecarState, SidecarStatus, MeshSyncOptions } from './MeshSync';
export { DiscoveryFacade } from './DiscoveryFacade';
export type { DiscoveryFacadeOptions } from './DiscoveryFacade';
