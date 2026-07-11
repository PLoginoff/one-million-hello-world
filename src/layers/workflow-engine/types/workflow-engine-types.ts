/**
 * WorkflowEngine Types
 *
 * Type definitions for the Workflow engine and state machines layer.
 */

export interface WorkflowEngineContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface WorkflowEngineError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface WorkflowEngineResult<T> {
  success: boolean;
  data?: T;
  error?: WorkflowEngineError;
}

export interface WorkflowEngineConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
