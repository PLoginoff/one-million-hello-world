/**
 * PerformanceTesting Types
 *
 * Type definitions for the Performance and load testing layer.
 */

export interface PerformanceTestingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface PerformanceTestingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PerformanceTestingResult<T> {
  success: boolean;
  data?: T;
  error?: PerformanceTestingError;
}

export interface PerformanceTestingConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
