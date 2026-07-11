/**
 * Migrations Types
 *
 * Type definitions for the Database migration and versioning layer.
 */

export interface MigrationsContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface MigrationsError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MigrationsResult<T> {
  success: boolean;
  data?: T;
  error?: MigrationsError;
}

export interface MigrationsConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
