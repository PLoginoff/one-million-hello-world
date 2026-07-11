/**
 * DataQuality Types
 *
 * Type definitions for the Data quality validation layer.
 */

export interface DataQualityContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DataQualityError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DataQualityResult<T> {
  success: boolean;
  data?: T;
  error?: DataQualityError;
}

export interface DataQualityConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
