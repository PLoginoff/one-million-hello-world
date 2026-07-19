/**
 * DisasterRecovery Types
 */

export interface DisasterRecoveryContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DisasterRecoveryError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DisasterRecoveryResult<T> {
  success: boolean;
  data?: T;
  error?: DisasterRecoveryError;
}
