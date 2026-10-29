export { ConsulDiscoveryAdapter } from './ConsulDiscoveryAdapter';
export { InMemoryDiscoveryAdapter } from './InMemoryDiscoveryAdapter';
export { ConsulLikeAdapter, aggregateHealth } from './ConsulLikeAdapter';
export type { ConsulCheckStatus, ConsulCheck, ConsulServiceEntry } from './ConsulLikeAdapter';
export { EtcdLikeAdapter } from './EtcdLikeAdapter';
export type { EtcdLease, EtcdKvEntry, EtcdWatchEvent, EtcdWatchHandler } from './EtcdLikeAdapter';
