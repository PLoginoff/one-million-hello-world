/**
 * FraudDetection Types
 *
 * Type definitions for the Fraud detection engine layer.
 */

export interface FraudDetectionContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface FraudDetectionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface FraudDetectionResult<T> {
  success: boolean;
  data?: T;
  error?: FraudDetectionError;
}

export interface FraudDetectionConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
