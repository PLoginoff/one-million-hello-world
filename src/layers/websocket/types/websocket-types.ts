/**
 * Websocket Types
 *
 * Type definitions for the WebSocket connection and message framing layer.
 */

export interface WebsocketContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface WebsocketError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface WebsocketResult<T> {
  success: boolean;
  data?: T;
  error?: WebsocketError;
}

export interface WebsocketConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
