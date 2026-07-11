/**
 * StreamProcessing Types
 *
 * Type definitions for the Stream processing abstraction layer.
 */

export interface StreamProcessingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface StreamProcessingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface StreamProcessingResult<T> {
  success: boolean;
  data?: T;
  error?: StreamProcessingError;
}

export interface StreamProcessingConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
