/**
 * Retry Policy Interface
 * 
 * Defines the contract for retry operations
 * including exponential backoff, jitter, and idempotency.
 */

import {
  RetryStrategy,
  RetryResult,
  RetryConfig,
} from '../types/retry-types';

/**
 * Interface for retry operations
 */
export interface IRetryPolicy {
  /**
   * Executes operation with retry logic
   * 
   * @param operation - Operation to execute
   * @returns Retry result
   */
  execute<T>(operation: () => T | Promise<T>): Promise<RetryResult<T>>;

  /**
   * Sets retry configuration
   * 
   * @param config - Retry configuration
   */
  setConfig(config: RetryConfig): void;

  /**
   * Gets current retry configuration
   * 
   * @returns Current retry configuration
   */
  getConfig(): RetryConfig;
}
