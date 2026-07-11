/**
 * Specification Types
 *
 * Type definitions for the Specification pattern layer layer.
 */

export interface SpecificationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface SpecificationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SpecificationResult<T> {
  success: boolean;
  data?: T;
  error?: SpecificationError;
}

export interface SpecificationConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
