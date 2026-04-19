/**
 * Error Handler Interface
 * 
 * Defines the contract for error handling
 * in the Saga Layer.
 */

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ErrorContext {
  stepName?: string;
  stepIndex?: number;
  operation: 'execution' | 'compensation' | 'validation';
  additionalInfo?: Record<string, unknown>;
}

export interface HandledError {
  originalError: Error;
  severity: ErrorSeverity;
  message: string;
  context: ErrorContext;
  timestamp: number;
  shouldCompensate: boolean;
}

export interface IErrorHandler {
  /**
   * Handles an error with context
   * 
   * @param error - The error to handle
   * @param context - Error context
   * @returns Handled error information
   */
  handle(error: Error, context: ErrorContext): HandledError;

  /**
   * Determines if compensation should be triggered for an error
   * 
   * @param error - The error to evaluate
   * @param context - Error context
   * @returns Whether compensation should be triggered
   */
  shouldTriggerCompensation(error: Error, context: ErrorContext): boolean;

  /**
   * Determines if execution should continue after an error
   * 
   * @param error - The error to evaluate
   * @param context - Error context
   * @returns Whether execution should continue
   */
  shouldContinueExecution(error: Error, context: ErrorContext): boolean;

  /**
   * Formats an error message for logging
   * 
   * @param error - The error to format
   * @param context - Error context
   * @returns Formatted error message
   */
  formatErrorMessage(error: Error, context: ErrorContext): string;

  /**
   * Gets the error severity based on error and context
   * 
   * @param error - The error to evaluate
   * @param context - Error context
   * @returns Error severity
   */
  getErrorSeverity(error: Error, context: ErrorContext): ErrorSeverity;
}
