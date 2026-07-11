/**
 * ReadModel Types
 *
 * Type definitions for the Read model projections layer.
 */

export interface ReadModelContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ReadModelError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReadModelResult<T> {
  success: boolean;
  data?: T;
  error?: ReadModelError;
}

export interface ReadModelConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
