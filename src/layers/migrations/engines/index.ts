/**
 * Migrations Engines — public surface.
 *
 * Versioned up/down scripts, checksum-protected history, ordered
 * batched application, dry-run, reversible migrations with data-loss
 * gating, conflict detection, and squashing.
 */

export {
  MigrationDirection,
  MigrationStatus,
  MigrationError,
  SystemClock,
  TestClock,
  createContext,
  migrationChecksum,
} from './types';
export type {
  Migration,
  MigrationContext,
  MigrationRecord,
  MigrationPlan,
  PlannedMigration,
  MigrationResult,
  MigrationReport,
  MigrationProgress,
  ProgressCallback,
  IClock,
} from './types';

export { InMemoryMigrationStore } from './MigrationStore';
export type { IMigrationStore } from './MigrationStore';

export { MigrationRunner } from './MigrationRunner';
export type { RunOptions } from './MigrationRunner';

export { ConflictDetector } from './ConflictDetector';
export type { MigrationConflict, ConflictReport } from './ConflictDetector';
