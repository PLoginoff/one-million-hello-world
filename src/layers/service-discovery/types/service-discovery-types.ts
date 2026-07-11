/**
 * ServiceDiscovery Types
 *
 * Type definitions for the Service discovery and registration layer.
 */

export interface ServiceDiscoveryContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ServiceDiscoveryError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ServiceDiscoveryResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceDiscoveryError;
}

export interface ServiceDiscoveryConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
