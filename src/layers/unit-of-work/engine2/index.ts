/**
 * UnitOfWork Engine2 — public exports.
 *
 * @module UnitOfWorkLayer/Engine2
 */

export * from './types';
export { NestedUnitOfWork, deepCopy } from './NestedUnitOfWork';
export { hashEntity, canonicalize } from './dirty';
export { InMemoryCommittedStore, ReadCommittedTx, WriteSkewError } from './ReadCommitted';
export type { CommittedStore, WriteConflict } from './ReadCommitted';
export { TransactionHooks } from './TransactionHooks';
export type { HookFn, HookOutcome } from './TransactionHooks';
export { DeadlockDetector } from './DeadlockDetector';
export type { WaitEdge, DeadlockReport, DeadlockDetectorOptions } from './DeadlockDetector';
