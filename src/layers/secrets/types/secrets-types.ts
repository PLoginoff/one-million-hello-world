/**
 * Secrets Types
 *
 * Type definitions for the Secrets management and vault abstraction layer.
 */

export interface SecretsContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface SecretsError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SecretsResult<T> {
  success: boolean;
  data?: T;
  error?: SecretsError;
}

export interface SecretsConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
