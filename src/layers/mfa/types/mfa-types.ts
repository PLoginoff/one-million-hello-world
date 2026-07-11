/**
 * Mfa Types
 *
 * Type definitions for the Multi-factor authentication layer.
 */

export interface MfaContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface MfaError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MfaResult<T> {
  success: boolean;
  data?: T;
  error?: MfaError;
}

export interface MfaConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
