/**
 * Notification Types
 */

export interface NotificationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface NotificationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface NotificationResult<T> {
  success: boolean;
  data?: T;
  error?: NotificationError;
}
