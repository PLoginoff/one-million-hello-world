/**
 * ServiceMesh Types
 *
 * Type definitions for the Service mesh abstraction and sidecar pattern layer.
 */

export interface ServiceMeshContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ServiceMeshError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ServiceMeshResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceMeshError;
}

export interface ServiceMeshConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
