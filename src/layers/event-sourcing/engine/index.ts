/**
 * Event-sourcing engine — snapshot scheduling, versioned snapshot store,
 * snapshot-shortcut rehydration, snapshot housekeeping, and the
 * distributed-store module: shard placement (consistent-hash ring /
 * rendezvous hashing), segmented sharded storage, primary→replica
 * shipping with lag tracking, read-replica routing, segment compaction,
 * and checksum integrity verification.
 */

export * from './SnapshotStore';
export * from './SnapshotScheduler';
export * from './AggregateRehydrator';
export * from './SnapshotMaintenance';
export * from './Sharding';
export * from './ShardedEventStore';
export * from './EventStoreReplication';
export * from './ReadReplicaRouter';
export * from './StoreCompactor';
export * from './StoreIntegrityVerifier';
