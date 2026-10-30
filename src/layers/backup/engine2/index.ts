/**
 * Backup Engine2 — public exports.
 *
 * @module BackupLayer/Engine2
 */

export { RestoreVerifier, InMemoryScratchStore } from './RestoreVerifier';
export type {
  ScratchStore,
  ObjectDiff,
  VerifyReport,
  RestoreVerifierOptions,
} from './RestoreVerifier';
export { ScheduleOptimizer, amortizedStorage } from './ScheduleOptimizer';
export type {
  SourceWorkload,
  OptimizeConstraints,
  SourcePlan,
  OptimizedSchedule,
} from './ScheduleOptimizer';
export { CrossRegionReplicator } from './ReplicationStub';
export type { ReplicationLag, ReplicationResult } from './ReplicationStub';
export { KeyRotationEngine } from './KeyRotation';
export type { KeyedManifest, RotationReport, KeyRotationOptions } from './KeyRotation';
export { ContentDefinedChunker } from './ContentChunker';
export type { Chunk, ChunkerConfig } from './ContentChunker';
export { RestorePointDiffEngine } from './RestorePointDiff';
export type { ObjectDiffEntry, RestorePointDiff } from './RestorePointDiff';
export { ManifestSigner, MANIFEST_GENESIS } from './ManifestSigner';
export type { SignedManifest } from './ManifestSigner';
