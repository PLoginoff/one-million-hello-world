/**
 * ErrorHandler - Core Implementation
 * 
 * Handles errors in event processing with configurable strategies.
 * Provides error tracking, logging, and recovery mechanisms.
 */

import { IErrorHandler, ErrorContext, ErrorHandlingStrategy } from '../interfaces';

export class ErrorHandler implements IErrorHandler {
  private _strategy: ErrorHandlingStrategy;
  private _errors: ErrorContext[];
  private _maxErrors: number;

  constructor(maxErrors: number = 1000) {
    this._strategy = 'log';
    this._errors = [];
    this._maxErrors = maxErrors;
  }

  handle(context: ErrorContext): void {
    this._addError(context);

    switch (this._strategy) {
      case 'ignore':
        break;
      case 'log':
        this._logError(context);
        break;
      case 'retry':
        this._logError(context);
        break;
      case 'circuit-breaker':
        this._logError(context);
        break;
      default:
        this._logError(context);
    }
  }

  setStrategy(strategy: ErrorHandlingStrategy): void {
    this._strategy = strategy;
  }

  getStrategy(): ErrorHandlingStrategy {
    return this._strategy;
  }

  getErrorCount(): number {
    return this._errors.length;
  }

  getErrors(): ErrorContext[] {
    return this._errors.map(error => ({ ...error }));
  }

  getErrorsByEventType(eventType: string): ErrorContext[] {
    return this._errors
      .filter(error => error.eventType === eventType)
      .map(error => ({ ...error }));
  }

  getErrorsBySubscription(subscriptionId: string): ErrorContext[] {
    return this._errors
      .filter(error => error.subscriptionId === subscriptionId)
      .map(error => ({ ...error }));
  }

  getRecentErrors(limit: number = 10): ErrorContext[] {
    return this._errors
      .slice(-limit)
      .map(error => ({ ...error }));
  }

  clearErrors(): void {
    this._errors = [];
  }

  private _addError(context: ErrorContext): void {
    this._errors.push({ ...context });

    if (this._errors.length > this._maxErrors) {
      this._errors.shift();
    }
  }

  private _logError(context: ErrorContext): void {
    console.error('[ErrorHandler]', {
      eventType: context.eventType,
      subscriptionId: context.subscriptionId,
      error: context.error.message,
      timestamp: context.timestamp.toISOString(),
    });
  }
}
