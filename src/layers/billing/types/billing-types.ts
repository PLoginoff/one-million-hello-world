/**
 * Billing Types
 */

export interface BillingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface BillingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BillingResult<T> {
  success: boolean;
  data?: T;
  error?: BillingError;
}
