/**
 * Sso Types
 *
 * Type definitions for the Single sign-on integration layer.
 */

export interface SsoContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface SsoError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SsoResult<T> {
  success: boolean;
  data?: T;
  error?: SsoError;
}

export interface SsoConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
