/**
 * BlueGreenDeploy Types
 *
 * Type definitions for the Blue-green deployment strategy layer.
 */

export interface BlueGreenDeployContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface BlueGreenDeployError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BlueGreenDeployResult<T> {
  success: boolean;
  data?: T;
  error?: BlueGreenDeployError;
}

export interface BlueGreenDeployConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
