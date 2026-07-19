/**
 * Governance Types
 */

export interface GovernanceContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface GovernanceError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GovernanceResult<T> {
  success: boolean;
  data?: T;
  error?: GovernanceError;
}
