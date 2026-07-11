/**
 * SchemaRegistry Types
 *
 * Type definitions for the Schema registry and contract validation layer.
 */

export interface SchemaRegistryContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface SchemaRegistryError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SchemaRegistryResult<T> {
  success: boolean;
  data?: T;
  error?: SchemaRegistryError;
}

export interface SchemaRegistryConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
