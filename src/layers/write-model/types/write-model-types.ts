/**
 * WriteModel Types
 *
 * Type definitions for the Write model and aggregate persistence layer.
 */

export interface WriteModelContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface WriteModelError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface WriteModelResult<T> {
  success: boolean;
  data?: T;
  error?: WriteModelError;
}

export interface WriteModelConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
