/**
 * Reporting Types
 */

export interface ReportingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ReportingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReportingResult<T> {
  success: boolean;
  data?: T;
  error?: ReportingError;
}
