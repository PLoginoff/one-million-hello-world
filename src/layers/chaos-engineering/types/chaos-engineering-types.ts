/**
 * ChaosEngineering Types
 *
 * Type definitions for the Chaos engineering and fault injection layer.
 */

export interface ChaosEngineeringContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ChaosEngineeringError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ChaosEngineeringResult<T> {
  success: boolean;
  data?: T;
  error?: ChaosEngineeringError;
}

export interface ChaosEngineeringConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
