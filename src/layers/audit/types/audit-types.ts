/**
 * Audit Types
 *
 * Type definitions for the Audit logging and compliance tracking layer.
 */

export interface AuditContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface AuditError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuditResult<T> {
  success: boolean;
  data?: T;
  error?: AuditError;
}

export interface AuditConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
