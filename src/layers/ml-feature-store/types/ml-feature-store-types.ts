/**
 * MlFeatureStore Types
 */

export interface MlFeatureStoreContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface MlFeatureStoreError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MlFeatureStoreResult<T> {
  success: boolean;
  data?: T;
  error?: MlFeatureStoreError;
}
