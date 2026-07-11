/**
 * CanaryDeploy Types
 *
 * Type definitions for the Canary deployment and rollout gating layer.
 */

export interface CanaryDeployContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface CanaryDeployError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CanaryDeployResult<T> {
  success: boolean;
  data?: T;
  error?: CanaryDeployError;
}

export interface CanaryDeployConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
