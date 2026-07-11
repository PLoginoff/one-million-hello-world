/**
 * Throttling Types
 *
 * Type definitions for the Throttling and quota management layer.
 */

export interface ThrottlingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ThrottlingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ThrottlingResult<T> {
  success: boolean;
  data?: T;
  error?: ThrottlingError;
}

export interface ThrottlingConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
