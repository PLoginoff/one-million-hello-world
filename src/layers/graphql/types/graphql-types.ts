/**
 * Graphql Types
 *
 * Type definitions for the GraphQL query parsing and resolver orchestration layer.
 */

export interface GraphqlContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface GraphqlError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GraphqlResult<T> {
  success: boolean;
  data?: T;
  error?: GraphqlError;
}

export interface GraphqlConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
