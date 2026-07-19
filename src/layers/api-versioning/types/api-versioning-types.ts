/**
 * ApiVersioning Types
 */

export interface ApiVersioningContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ApiVersioningError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiVersioningResult<T> {
  success: boolean;
  data?: T;
  error?: ApiVersioningError;
}
