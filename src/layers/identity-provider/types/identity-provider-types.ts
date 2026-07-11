/**
 * IdentityProvider Types
 *
 * Type definitions for the Identity provider abstraction layer.
 */

export interface IdentityProviderContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface IdentityProviderError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface IdentityProviderResult<T> {
  success: boolean;
  data?: T;
  error?: IdentityProviderError;
}

export interface IdentityProviderConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
