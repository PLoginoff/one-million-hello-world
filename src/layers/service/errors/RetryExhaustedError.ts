/**
 * Retry Exhausted Error
 *
 * Thrown when all retry attempts have been exhausted for an operation.
 *
 * @module ServiceLayer/Errors
 */

import { ServiceError, ServiceErrorDetails } from './ServiceError';

/**
 * Error thrown when retry attempts are exhausted.
 */
export class RetryExhaustedError extends ServiceError {
  /** The name of the operation that was retried */
  readonly operationName: string;

  /** The number of retry attempts that were made */
  readonly attemptsMade: number;

  /** The maximum number of retries that were configured */
  readonly maxRetries: number;

  /** The last error that occurred before giving up */
  readonly lastError: Error | undefined;

  /**
   * Creates a new RetryExhaustedError instance.
   *
   * @param operationName - Name of the operation that was retried
   * @param attemptsMade - Number of attempts made (including initial attempt)
   * @param maxRetries - Maximum number of retries configured
   * @param lastError - The last error that occurred
   * @param options - Optional additional details
   */
  constructor(
    operationName: string,
    attemptsMade: number,
    maxRetries: number,
    lastError?: Error,
    options: {
      details?: ServiceErrorDetails;
    } = {}
  ) {
    const details: ServiceErrorDetails = {
      operationName,
      attemptsMade,
      maxRetries,
      ...options.details,
    };
    if (lastError) {
      details.lastError = {
        name: lastError.name,
        message: lastError.message,
        stack: lastError.stack,
      };
    }

    super(
      'RETRY_EXHAUSTED',
      `Operation '${operationName}' failed after ${attemptsMade} attempts (max retries: ${maxRetries})`,
      {
        statusCode: 503,
        details,
        retryable: false,
        cause: lastError,
      }
    );

    this.name = 'RetryExhaustedError';
    this.operationName = operationName;
    this.attemptsMade = attemptsMade;
    this.maxRetries = maxRetries;
    this.lastError = lastError;
  }

  /**
   * Creates a RetryExhaustedError from a RetryServiceStrategy metrics.
   *
   * @param operationName - Name of the operation
   * @param metrics - Retry metrics from the strategy
   * @param lastError - The last error that occurred
   * @returns RetryExhaustedError instance
   */
  static fromMetrics(
    operationName: string,
    metrics: { totalAttempts: number; maxRetries: number },
    lastError?: Error
  ): RetryExhaustedError {
    return new RetryExhaustedError(operationName, metrics.totalAttempts, metrics.maxRetries, lastError);
  }
}
