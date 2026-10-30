/**
 * Inbox Engine2 — metrics, priority lanes, key-partitioned parallelism,
 * archival, and history replay.
 *
 * @module Inbox/Engine2
 */

export { InboxMetricsCollector, Reservoir, RateTracker, summarize } from './InboxMetrics';
export type { LatencySummary, LatencyKind, InboxMetricsSnapshot } from './InboxMetrics';

export { PriorityInbox } from './PriorityInbox';
export type { PriorityConfig, PriorityProcessResult } from './PriorityInbox';

export { PartitionedInbox } from './PartitionedInbox';
export type { PartitionStats, PartitionDrainResult } from './PartitionedInbox';

export { InboxArchive, InboxArchiver, InboxReplayer } from './InboxArchiver';
export type { ArchivedRecord, ArchiveQuery, ArchivePolicy, ArchiveSweepResult, ReplayResult } from './InboxArchiver';
