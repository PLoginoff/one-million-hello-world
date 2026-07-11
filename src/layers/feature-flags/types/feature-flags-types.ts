/**
 * FeatureFlags Types
 *
 * Type definitions for the Feature flags and dynamic toggles layer.
 */

export interface FeatureFlagsContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface FeatureFlagsError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface FeatureFlagsResult<T> {
  success: boolean;
  data?: T;
  error?: FeatureFlagsError;
}

export interface FeatureFlagsConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
