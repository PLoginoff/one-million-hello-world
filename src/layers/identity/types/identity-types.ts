/**
 * Identity Types
 *
 * Type definitions for the Identity and user management layer.
 */

export interface IdentityContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface IdentityError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface IdentityResult<T> {
  success: boolean;
  data?: T;
  error?: IdentityError;
}

export interface IdentityConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
