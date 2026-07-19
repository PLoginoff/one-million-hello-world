/**
 * SecretsRotation Types
 */

export interface SecretsRotationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface SecretsRotationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SecretsRotationResult<T> {
  success: boolean;
  data?: T;
  error?: SecretsRotationError;
}
