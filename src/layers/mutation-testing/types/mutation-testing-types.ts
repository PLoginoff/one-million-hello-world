/**
 * MutationTesting Types
 *
 * Type definitions for the Mutation testing layer layer.
 */

export interface MutationTestingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface MutationTestingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MutationTestingResult<T> {
  success: boolean;
  data?: T;
  error?: MutationTestingError;
}

export interface MutationTestingConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
