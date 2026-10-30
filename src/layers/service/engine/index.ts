/**
 * Service Engine — public exports.
 *
 * Executable service core: unit-of-work transaction scripts, service
 * middleware composition, idempotency store, bulkhead, retry with
 * jitter, timeout, and circuit-breaker hooks.
 *
 * @module ServiceLayer/Engine
 */

export * from './types';

export {
  TransactionScriptRunner,
  TransactionError,
  StagedUnitOfWork,
  InMemoryRecordStore,
  SystemClock,
  ManualClock,
} from './TransactionScriptRunner';
export type { Clock, TransactionReport } from './TransactionScriptRunner';

export {
  ServicePipeline,
  Bulkhead,
  InMemoryIdempotencyStore,
  IdempotencyMismatchError,
  SystemScheduler,
  ManualScheduler,
  withTimeout,
  retryDelay,
  DEFAULT_RETRY_POLICY,
} from './ServicePipeline';
export type { Scheduler, ServicePipelineOptions } from './ServicePipeline';
