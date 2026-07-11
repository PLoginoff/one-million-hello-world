/**
 * JwtValidation Types
 *
 * Type definitions for the JWT token validation layer.
 */

export interface JwtValidationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface JwtValidationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface JwtValidationResult<T> {
  success: boolean;
  data?: T;
  error?: JwtValidationError;
}

export interface JwtValidationConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
