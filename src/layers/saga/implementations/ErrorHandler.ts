/**
 * Error Handler Implementation
 * 
 * Concrete implementation of IErrorHandler.
 * Provides error handling with severity assessment.
 */

import { IErrorHandler, ErrorSeverity, ErrorContext, HandledError } from '../interfaces/IErrorHandler';
import { ILogger } from '../interfaces/ILogger';

export class ErrorHandler implements IErrorHandler {
  private readonly _logger: ILogger;
  private readonly _severityRules: Map<string, (error: Error) => ErrorSeverity>;

  constructor(logger: ILogger) {
    this._logger = logger;
    this._severityRules = new Map<string, (error: Error) => ErrorSeverity>([
      ['ValidationError', () => ErrorSeverity.LOW],
      ['TimeoutError', () => ErrorSeverity.MEDIUM],
      ['NetworkError', () => ErrorSeverity.MEDIUM],
      ['DatabaseError', () => ErrorSeverity.HIGH],
      ['CriticalError', () => ErrorSeverity.CRITICAL],
    ]);
  }

  handle(error: Error, context: ErrorContext): HandledError {
    const severity = this.getErrorSeverity(error, context);
    const message = this.formatErrorMessage(error, context);
    const shouldCompensate = this.shouldTriggerCompensation(error, context);

    const handledError: HandledError = {
      originalError: error,
      severity,
      message,
      context,
      timestamp: Date.now(),
      shouldCompensate,
    };

    this._logger.error(message, { severity, context, timestamp: handledError.timestamp });

    return handledError;
  }

  shouldTriggerCompensation(error: Error, context: ErrorContext): boolean {
    if (context.operation === 'compensation') {
      return false;
    }

    const severity = this.getErrorSeverity(error, context);
    return severity !== ErrorSeverity.LOW;
  }

  shouldContinueExecution(error: Error, context: ErrorContext): boolean {
    const severity = this.getErrorSeverity(error, context);
    return severity === ErrorSeverity.LOW;
  }

  formatErrorMessage(error: Error, context: ErrorContext): string {
    const parts = [
      `Error in ${context.operation}`,
      context.stepName ? `at step '${context.stepName}'` : '',
      context.stepIndex !== undefined ? `(index ${context.stepIndex})` : '',
      `: ${error.message}`,
    ];

    return parts.filter(Boolean).join(' ');
  }

  getErrorSeverity(error: Error, context: ErrorContext): ErrorSeverity {
    const errorName = error.constructor.name;

    for (const [pattern, rule] of this._severityRules) {
      if (errorName.includes(pattern)) {
        return rule(error);
      }
    }

    if (context.operation === 'compensation') {
      return ErrorSeverity.HIGH;
    }

    return ErrorSeverity.MEDIUM;
  }
}
