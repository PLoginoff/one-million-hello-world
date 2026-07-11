/**
 * Analytics Types
 *
 * Type definitions for the Analytics and event tracking layer.
 */

export interface AnalyticsContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface AnalyticsError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AnalyticsResult<T> {
  success: boolean;
  data?: T;
  error?: AnalyticsError;
}

export interface AnalyticsConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
