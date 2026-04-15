/**
 * Retry Layer Types
 * 
 * This module defines all type definitions for the Retry Layer,
 * including exponential backoff, jitter, and idempotency.
 */

/**
 * Retry strategy
 */
export enum RetryStrategy {
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  FIXED_DELAY = 'fixed_delay',
  LINEAR_BACKOFF = 'linear_backoff',
}

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  attempts: number;
  error?: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  strategy: RetryStrategy;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}
