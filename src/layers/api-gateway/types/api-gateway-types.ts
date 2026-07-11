/**
 * ApiGateway Types
 *
 * Type definitions for the API gateway abstraction, routing, and transformation layer.
 */

export interface ApiGatewayContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ApiGatewayError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiGatewayResult<T> {
  success: boolean;
  data?: T;
  error?: ApiGatewayError;
}

export interface ApiGatewayConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
