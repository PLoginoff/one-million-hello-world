/**
 * DataLineage Types
 */

export interface DataLineageContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DataLineageError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DataLineageResult<T> {
  success: boolean;
  data?: T;
  error?: DataLineageError;
}
