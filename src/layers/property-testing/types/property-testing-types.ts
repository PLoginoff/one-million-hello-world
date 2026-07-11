/**
 * PropertyTesting Types
 *
 * Type definitions for the Property-based testing layer.
 */

export interface PropertyTestingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface PropertyTestingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PropertyTestingResult<T> {
  success: boolean;
  data?: T;
  error?: PropertyTestingError;
}

export interface PropertyTestingConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
