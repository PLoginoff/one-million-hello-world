/**
 * ContractTesting Types
 *
 * Type definitions for the Contract testing layer layer.
 */

export interface ContractTestingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ContractTestingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ContractTestingResult<T> {
  success: boolean;
  data?: T;
  error?: ContractTestingError;
}

export interface ContractTestingConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
