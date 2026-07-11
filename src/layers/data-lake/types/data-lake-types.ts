/**
 * DataLake Types
 *
 * Type definitions for the Data lake ingestion and storage layer.
 */

export interface DataLakeContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DataLakeError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DataLakeResult<T> {
  success: boolean;
  data?: T;
  error?: DataLakeError;
}

export interface DataLakeConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
