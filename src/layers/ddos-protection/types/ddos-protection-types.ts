/**
 * DdosProtection Types
 *
 * Type definitions for the DDoS protection layer layer.
 */

export interface DdosProtectionContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DdosProtectionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DdosProtectionResult<T> {
  success: boolean;
  data?: T;
  error?: DdosProtectionError;
}

export interface DdosProtectionConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
