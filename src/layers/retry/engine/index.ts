/**
 * Retry Engine — public exports.
 *
 * @module RetryLayer/Engine
 */

export {
  RetryReason,
  RetryEngineError,
  RetryBudgetExhaustedError,
  NonIdempotentError,
  SystemEngineClock,
  ManualEngineClock,
} from './types';
export type {
  RetryEngineClock,
  AttemptFailure,
  ClassifiedFailure,
  Idempotency,
} from './types';
export { RetryBudget, RetryBudgetRegistry } from './RetryBudget';
export type { RetryBudgetOptions, BudgetSnapshot } from './RetryBudget';
export { RetryAfterParser } from './RetryAfterParser';
export type { RetryAfterParseOptions } from './RetryAfterParser';
export { AdaptiveBackoff } from './AdaptiveBackoff';
export type { AdaptiveBackoffOptions } from './AdaptiveBackoff';
export { HedgedExecutor } from './HedgedExecutor';
export type { HedgedOptions, HedgedResult, HedgeTimerFn } from './HedgedExecutor';
export { DecorrelatedJitter } from './DecorrelatedJitter';
export type { JitterOptions } from './DecorrelatedJitter';
export { IdempotencyRegistry, IdempotencyConflictError, IdempotencyInFlightError } from './IdempotencyRegistry';
export type { IdempotencyOptions, IdemCheckResult } from './IdempotencyRegistry';
export { RetrySession, RetrySessionExpiredError } from './RetrySession';
export type { RetrySessionOptions } from './RetrySession';
export { RetryPolicyTable } from './RetryPolicyTable';
export type { ScopePolicy, ResolvedPolicy } from './RetryPolicyTable';
export { RetryEngine, RetryExhaustedError } from './RetryEngine';
export type {
  OperationResult,
  RetryableOperation,
  Sleeper,
  RetryEngineOptions,
  AttemptRecord,
  RetryOutcome,
  FailureClassifier,
} from './RetryEngine';
