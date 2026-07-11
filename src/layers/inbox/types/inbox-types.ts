/**
 * Inbox Types
 *
 * Type definitions for the Inbox pattern for idempotent consumers layer.
 */

export interface InboxContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface InboxError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface InboxResult<T> {
  success: boolean;
  data?: T;
  error?: InboxError;
}

export interface InboxConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
