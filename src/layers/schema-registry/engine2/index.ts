/**
 * SchemaRegistry Engine2 — diff visualization, bundles, usage
 * tracking, deprecation workflow, replication.
 *
 * @module SchemaRegistry/Engine2
 */

export { SchemaDiffViewBuilder, severityOf, actionFor } from './SchemaDiffView';
export type { DiffSeverity, DiffRow, SchemaDiffView } from './SchemaDiffView';

export { exportBundle, importBundle, bundleChecksum } from './SchemaBundle';
export type { SchemaBundle, BundledVersion, BundledSubject, ImportOutcome, ImportReport } from './SchemaBundle';

export { UsageTracker } from './UsageTracker';
export type { UsageSighting, VersionUsage, ConsumerUsage } from './UsageTracker';

export { DeprecationWorkflow, SunsetState } from './DeprecationWorkflow';
export type { Deprecation, DeprecationNotifier, EnforcementReport } from './DeprecationWorkflow';

export { ReplicatedSource, RegistryReplicator, InMemoryReplicationChannel } from './RegistryReplicator';
export type {
  ReplicationEventKind,
  ReplicationEvent,
  ReplicationChannel,
  ReplicaApplyResult,
  ReplicaStatus,
} from './RegistryReplicator';
