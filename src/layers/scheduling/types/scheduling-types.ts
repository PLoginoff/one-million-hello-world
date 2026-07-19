/**
 * Scheduling Types
 */

export interface SchedulingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface SchedulingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SchedulingResult<T> {
  success: boolean;
  data?: T;
  error?: SchedulingError;
}
