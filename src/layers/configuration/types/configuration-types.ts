/**
 * Configuration Types
 *
 * Type definitions for the Configuration management and dynamic settings layer.
 */

export interface ConfigurationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ConfigurationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ConfigurationResult<T> {
  success: boolean;
  data?: T;
  error?: ConfigurationError;
}

export interface ConfigurationConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
