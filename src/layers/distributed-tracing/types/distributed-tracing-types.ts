/**
 * DistributedTracing Types
 *
 * Type definitions for the Distributed tracing with OpenTelemetry layer.
 */

export interface DistributedTracingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DistributedTracingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DistributedTracingResult<T> {
  success: boolean;
  data?: T;
  error?: DistributedTracingError;
}

export interface DistributedTracingConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
