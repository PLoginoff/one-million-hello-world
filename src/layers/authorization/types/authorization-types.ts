/**
 * Authorization Types
 *
 * Type definitions for the Authorization and policy enforcement layer.
 */

export interface AuthorizationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface AuthorizationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuthorizationResult<T> {
  success: boolean;
  data?: T;
  error?: AuthorizationError;
}

export interface AuthorizationConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
