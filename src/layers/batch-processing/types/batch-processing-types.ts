/**
 * BatchProcessing Types
 */

export interface BatchProcessingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface BatchProcessingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BatchProcessingResult<T> {
  success: boolean;
  data?: T;
  error?: BatchProcessingError;
}
