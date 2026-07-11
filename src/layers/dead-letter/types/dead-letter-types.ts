/**
 * DeadLetter Types
 *
 * Type definitions for the Dead letter queue management layer.
 */

export interface DeadLetterContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DeadLetterError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DeadLetterResult<T> {
  success: boolean;
  data?: T;
  error?: DeadLetterError;
}

export interface DeadLetterConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
