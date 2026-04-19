/**
 * IErrorHandler - Core Interface
 * 
 * Interface for handling errors in event processing.
 * Provides error capture, logging, and recovery strategies.
 */

export interface ErrorContext {
  eventType: string;
  subscriptionId: string;
  error: Error;
  timestamp: Date;
  eventData?: unknown;
}

export type ErrorHandlingStrategy = 'ignore' | 'log' | 'retry' | 'circuit-breaker';

export interface IErrorHandler {
  handle(context: ErrorContext): void;
  setStrategy(strategy: ErrorHandlingStrategy): void;
  getStrategy(): ErrorHandlingStrategy;
  getErrorCount(): number;
  getErrors(): ErrorContext[];
  clearErrors(): void;
}
