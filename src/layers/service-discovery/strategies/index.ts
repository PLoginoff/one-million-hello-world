export { ServiceDiscoveryDefaultStrategy } from './DefaultStrategy';
export { ServiceDiscoveryFastStrategy } from './FastStrategy';
export { ServiceDiscoveryReliableStrategy } from './ReliableStrategy';
export { ServiceDiscoveryCachedStrategy } from './CachedStrategy';
export { ServiceDiscoveryBatchStrategy } from './BatchStrategy';

// Real discovery mechanisms
export { InMemoryRegistry } from './InMemoryRegistry';
export type { InMemoryRegistryConfig } from './InMemoryRegistry';
export { HeartbeatHealthChecker } from './HeartbeatHealthChecker';
export type { HeartbeatSweep } from './HeartbeatHealthChecker';
export { WatchNotifier, matchesFilter } from './WatchNotifier';
export type { EventFilter, EventHandler } from './WatchNotifier';
export { DnsResolver } from './DnsResolver';
export type { SrvRecord, DnsResolverConfig } from './DnsResolver';
