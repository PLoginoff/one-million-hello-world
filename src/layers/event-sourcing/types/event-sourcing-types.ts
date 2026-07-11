/**
 * EventSourcing Types
 *
 * Type definitions for the Event sourcing and event store layer.
 */

export interface EventSourcingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface EventSourcingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface EventSourcingResult<T> {
  success: boolean;
  data?: T;
  error?: EventSourcingError;
}

export interface EventSourcingConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
