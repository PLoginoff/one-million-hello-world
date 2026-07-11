/**
 * LoadBalancer Types
 *
 * Type definitions for the Load balancing and traffic distribution layer.
 */

export interface LoadBalancerContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface LoadBalancerError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface LoadBalancerResult<T> {
  success: boolean;
  data?: T;
  error?: LoadBalancerError;
}

export interface LoadBalancerConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
