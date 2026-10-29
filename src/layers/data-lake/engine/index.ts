/**
 * Data Lake Engine — public surface.
 *
 * Zone management, columnar file format, ACID transaction log,
 * hive-style partitioning, compaction and schema evolution.
 *
 * @module DataLake/Engine
 */

export { LakeObjectStore, ZoneManager, zoneOfPath } from './ZoneManager';
export type {
  LakeObject,
  QuarantineEntry,
  Zone,
  ZonePolicy,
  ZoneTransition,
  ZoneValidator,
} from './ZoneManager';
export type { ValidationResult as ZoneValidationResult } from './ZoneManager';

export { ColumnarFileReader, ColumnarFileWriter } from './ColumnarFileFormat';
export type {
  ColumnChunkMeta,
  LakeColumnSchema,
  LakeColumnType,
  LakeRow,
  LakeScalar,
} from './ColumnarFileFormat';

export { ConcurrentModificationError, DeltaTable, TransactionLog } from './TransactionLog';
export type { CommitEntry, LogAction, TableSnapshot } from './TransactionLog';

export {
  Compactor,
  buildPath,
  parsePath,
  partitionPredicate,
  prunePaths,
} from './HivePartitioning';
export type {
  CompactionBin,
  CompactionCandidate,
  CompactionPlan,
  PartitionPredicate,
} from './HivePartitioning';

export { MergeOnReadTable, recordKey } from './MergeOnRead';
export type { LakeRecord, MorOptions, ReadOptions } from './MergeOnRead';

export { SchemaRegistry, checkCompatibility, diffSchemas } from './SchemaEvolution';
export type {
  CompatibilityMode,
  CompatibilityViolation,
  SchemaChange,
  SchemaVersion,
} from './SchemaEvolution';
