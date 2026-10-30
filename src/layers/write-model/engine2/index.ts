/**
 * WriteModel Engine2 — public exports.
 *
 * @module WriteModelLayer/Engine2
 */

export * from './types';
export { CommandDedup } from './CommandDedup';
export type { DedupOptions, DedupStatus, DedupCheck } from './CommandDedup';
export {
  ValidationPipeline,
  requiredFields,
  schemaShape,
  expectedVersion,
  invariant,
} from './ValidationPipeline';
export type { Violation, ValidationVerdict, CommandContext, ValidatorFn } from './ValidationPipeline';
export { AggregateArchiver } from './AggregateArchiver';
export type { ArchiverOptions, ArchiveVerdict, HotAggregate } from './AggregateArchiver';
export { WriteBehindBuffer } from './WriteBehindBuffer';
export type { WriteBehindOptions, BufferedEvent, FlushResult } from './WriteBehindBuffer';
export { resolveConflicts, isConcurrent, mergers } from './ConflictResolver';
export type { ConflictStrategy, Write, ConflictReport, MergeFn } from './ConflictResolver';
