/**
 * Localization Types
 */

export interface LocalizationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface LocalizationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface LocalizationResult<T> {
  success: boolean;
  data?: T;
  error?: LocalizationError;
}
