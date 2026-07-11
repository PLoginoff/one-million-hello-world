/**
 * Outbox Types
 *
 * Type definitions for the Transactional outbox pattern layer.
 */

export interface OutboxContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface OutboxError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface OutboxResult<T> {
  success: boolean;
  data?: T;
  error?: OutboxError;
}

export interface OutboxConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
