/**
 * RulesEngine Types
 *
 * Type definitions for the Business rules engine layer.
 */

export interface RulesEngineContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface RulesEngineError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface RulesEngineResult<T> {
  success: boolean;
  data?: T;
  error?: RulesEngineError;
}

export interface RulesEngineConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
