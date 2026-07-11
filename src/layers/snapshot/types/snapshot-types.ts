/**
 * Snapshot Types
 *
 * Type definitions for the Snapshot storage and optimization layer.
 */

export interface SnapshotContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface SnapshotError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SnapshotResult<T> {
  success: boolean;
  data?: T;
  error?: SnapshotError;
}

export interface SnapshotConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
