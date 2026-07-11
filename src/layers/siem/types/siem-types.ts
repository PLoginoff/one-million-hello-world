/**
 * Siem Types
 *
 * Type definitions for the Security information and event management layer.
 */

export interface SiemContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface SiemError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SiemResult<T> {
  success: boolean;
  data?: T;
  error?: SiemError;
}

export interface SiemConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
