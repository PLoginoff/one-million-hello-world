/**
 * Encryption Types
 *
 * Type definitions for the Encryption at rest and in transit layer.
 */

export interface EncryptionContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface EncryptionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface EncryptionResult<T> {
  success: boolean;
  data?: T;
  error?: EncryptionError;
}

export interface EncryptionConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
