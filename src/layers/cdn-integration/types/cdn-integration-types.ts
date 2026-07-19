/**
 * CdnIntegration Types
 */

export interface CdnIntegrationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface CdnIntegrationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CdnIntegrationResult<T> {
  success: boolean;
  data?: T;
  error?: CdnIntegrationError;
}
