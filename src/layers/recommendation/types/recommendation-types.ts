/**
 * Recommendation Types
 */

export interface RecommendationContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface RecommendationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface RecommendationResult<T> {
  success: boolean;
  data?: T;
  error?: RecommendationError;
}
