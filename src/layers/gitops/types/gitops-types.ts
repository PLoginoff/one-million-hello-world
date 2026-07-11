/**
 * Gitops Types
 *
 * Type definitions for the GitOps deployment reconciliation layer.
 */

export interface GitopsContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface GitopsError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GitopsResult<T> {
  success: boolean;
  data?: T;
  error?: GitopsError;
}

export interface GitopsConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
