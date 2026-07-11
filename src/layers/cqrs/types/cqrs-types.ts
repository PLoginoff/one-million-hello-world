/**
 * Cqrs Types
 *
 * Type definitions for the Command Query Responsibility Segregation layer.
 */

export interface CqrsContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface CqrsError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CqrsResult<T> {
  success: boolean;
  data?: T;
  error?: CqrsError;
}

export interface CqrsConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
