/**
 * DataWarehouse Types
 *
 * Type definitions for the Data warehouse abstraction layer.
 */

export interface DataWarehouseContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DataWarehouseError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DataWarehouseResult<T> {
  success: boolean;
  data?: T;
  error?: DataWarehouseError;
}

export interface DataWarehouseConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
