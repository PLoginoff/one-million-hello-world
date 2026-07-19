/**
 * MultiTenancy Types
 */

export interface MultiTenancyContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface MultiTenancyError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MultiTenancyResult<T> {
  success: boolean;
  data?: T;
  error?: MultiTenancyError;
}
