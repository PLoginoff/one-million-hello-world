/**
 * UnitOfWork Types
 *
 * Type definitions for the Unit of work pattern layer.
 */

export interface UnitOfWorkContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface UnitOfWorkError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface UnitOfWorkResult<T> {
  success: boolean;
  data?: T;
  error?: UnitOfWorkError;
}

export interface UnitOfWorkConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
