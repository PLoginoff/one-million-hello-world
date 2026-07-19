/**
 * AnomalyDetection Types
 */

export interface AnomalyDetectionContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface AnomalyDetectionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AnomalyDetectionResult<T> {
  success: boolean;
  data?: T;
  error?: AnomalyDetectionError;
}
