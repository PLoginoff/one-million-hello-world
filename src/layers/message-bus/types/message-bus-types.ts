/**
 * MessageBus Types
 *
 * Type definitions for the Enterprise message bus and event streaming layer.
 */

export interface MessageBusContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface MessageBusError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MessageBusResult<T> {
  success: boolean;
  data?: T;
  error?: MessageBusError;
}

export interface MessageBusConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
