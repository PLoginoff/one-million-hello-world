/**
 * BotDetection Types
 *
 * Type definitions for the Bot detection and traffic filtering layer.
 */

export interface BotDetectionContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface BotDetectionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BotDetectionResult<T> {
  success: boolean;
  data?: T;
  error?: BotDetectionError;
}

export interface BotDetectionConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
