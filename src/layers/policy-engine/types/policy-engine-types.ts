/**
 * PolicyEngine Types
 *
 * Type definitions for the Policy evaluation engine layer.
 */

export interface PolicyEngineContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface PolicyEngineError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PolicyEngineResult<T> {
  success: boolean;
  data?: T;
  error?: PolicyEngineError;
}

export interface PolicyEngineConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
