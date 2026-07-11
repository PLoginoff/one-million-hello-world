/**
 * Observability Types
 *
 * Type definitions for the Metrics, logs and traces aggregation layer.
 */

export interface ObservabilityContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ObservabilityError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ObservabilityResult<T> {
  success: boolean;
  data?: T;
  error?: ObservabilityError;
}

export interface ObservabilityConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
