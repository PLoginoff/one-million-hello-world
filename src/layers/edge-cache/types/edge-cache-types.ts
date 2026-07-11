/**
 * EdgeCache Types
 *
 * Type definitions for the Edge caching and CDN abstraction layer.
 */

export interface EdgeCacheContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface EdgeCacheError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface EdgeCacheResult<T> {
  success: boolean;
  data?: T;
  error?: EdgeCacheError;
}

export interface EdgeCacheConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
