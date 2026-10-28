/**
 * Use Case Execution Error
 *
 * Thrown when a use case execution fails due to an unexpected error.
 *
 * @module ServiceLayer/Errors
 */

import { ServiceError, ServiceErrorDetails } from './ServiceError';

/**
 * Error thrown when a use case execution fails.
 */
export class UseCaseExecutionError extends ServiceError {
  /** The name of the use case that failed */
  readonly useCaseName: string;

  /** The original error that caused the failure */
  readonly originalError: Error | undefined;

  /**
   * Creates a new UseCaseExecutionError instance.
   *
   * @param useCaseName - Name of the use case that failed
   * @param message - Error message
   * @param originalError - Optional original error that caused the failure
   * @param details - Optional additional details
   */
  constructor(useCaseName: string, message: string, originalError?: Error, details?: ServiceErrorDetails) {
    const errorDetails: ServiceErrorDetails = { useCaseName, ...details };
    if (originalError) {
      errorDetails.originalError = {
        name: originalError.name,
        message: originalError.message,
        stack: originalError.stack,
      };
    }

    super('USE_CASE_EXECUTION_ERROR', message, {
      statusCode: 500,
      details: errorDetails,
      retryable: true,
      cause: originalError,
    });

    this.name = 'UseCaseExecutionError';
    this.useCaseName = useCaseName;
    this.originalError = originalError;
  }

  /**
   * Creates a UseCaseExecutionError from an unknown error.
   *
   * @param useCaseName - Name of the use case that failed
   * @param error - The error that occurred (can be any value)
   * @returns UseCaseExecutionError instance
   */
  static fromUnknown(useCaseName: string, error: unknown): UseCaseExecutionError {
    if (error instanceof Error) {
      return new UseCaseExecutionError(useCaseName, error.message, error);
    }
    return new UseCaseExecutionError(useCaseName, String(error));
  }
}
