/**
 * Waf Types
 *
 * Type definitions for the Web Application Firewall layer.
 */

export interface WafContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface WafError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface WafResult<T> {
  success: boolean;
  data?: T;
  error?: WafError;
}

export interface WafConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
