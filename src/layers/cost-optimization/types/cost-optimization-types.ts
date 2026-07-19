/**
 * CostOptimization Types
 */

export interface CostOptimizationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface CostOptimizationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CostOptimizationResult<T> {
  success: boolean;
  data?: T;
  error?: CostOptimizationError;
}
