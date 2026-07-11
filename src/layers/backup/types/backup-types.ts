/**
 * Backup Types
 *
 * Type definitions for the Backup and disaster recovery layer.
 */

export interface BackupContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface BackupError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BackupResult<T> {
  success: boolean;
  data?: T;
  error?: BackupError;
}

export interface BackupConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
