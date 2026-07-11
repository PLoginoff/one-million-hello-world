/**
 * QueryObject Types
 *
 * Type definitions for the Query object and specification queries layer.
 */

export interface QueryObjectContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface QueryObjectError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface QueryObjectResult<T> {
  success: boolean;
  data?: T;
  error?: QueryObjectError;
}

export interface QueryObjectConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
