/**
 * Oauth2 Types
 *
 * Type definitions for the OAuth2 provider integration layer.
 */

export interface Oauth2Context {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface Oauth2Error {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Oauth2Result<T> {
  success: boolean;
  data?: T;
  error?: Oauth2Error;
}

export interface Oauth2Config {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
