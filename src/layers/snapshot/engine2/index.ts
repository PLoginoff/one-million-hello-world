/**
 * Snapshot Engine2 — diffing, chain verification, scheduling,
 * encryption-at-rest, and cross-region replication.
 *
 * @module SnapshotLayer/Engine2
 */

export { SnapshotDiffer, SnapshotChangeKind, deepEqual, diffObjects } from './SnapshotDiffer';
export type { SnapshotKeyChange, FieldDiff, SnapshotDiffReport, DiffOptions } from './SnapshotDiffer';

export { BackupChainVerifier, ChainCompactor, stateDigest } from './BackupChainVerifier';
export type { LinkVerification, ChainReport, SquashResult } from './BackupChainVerifier';

export { SnapshotScheduler, parseCron, nextCronRun, retentionPolicyAdapter } from './SnapshotScheduler';
export type {
  CronSchedule,
  RetentionDecision as SchedulerRetentionDecision,
  RetentionEvaluator,
  SnapshotJob,
  JobFireResult,
} from './SnapshotScheduler';

export { SnapshotCrypto, StaticKeyProvider, EncryptedSnapshotStore } from './SnapshotCrypto';
export type { KeyProvider, SnapshotEnvelope, SealedPayload } from './SnapshotCrypto';

export { CrossRegionReplicator, InMemoryRegionTransport, RemoteSnapshotStore } from './CrossRegionReplicator';
export type { SnapshotWireRecord, RegionTransport, CopyResult, SyncReport } from './CrossRegionReplicator';
