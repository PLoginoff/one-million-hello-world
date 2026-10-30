/**
 * Data Lake — Engine2 public surface.
 *
 * Schema-enforced versioned tables with time travel, partition-aware
 * row compaction, and partition statistics with skew detection.
 *
 * @module DataLake/Engine2
 */

export {
  manifestToActions,
  SchemaViolationError,
  validateRows,
  VersionedTable,
  VersionNotFoundError,
} from './VersionedTable';
export type {
  TableCommit,
  TableFile,
  TableManifest,
  WriteOptions,
} from './VersionedTable';

export { CompactionEngine, DEFAULT_COMPACTION_CONFIG } from './CompactionEngine';
export type {
  CompactionConfig,
  CompactionPlan2,
  CompactionResult,
  MergeBin,
} from './CompactionEngine';

export { DEFAULT_PARTITION_STATS_CONFIG, PartitionStats } from './PartitionStats';
export type {
  PartitionAnalysis,
  PartitionStat,
  PartitionStatsConfig,
  SkewReport,
} from './PartitionStats';
