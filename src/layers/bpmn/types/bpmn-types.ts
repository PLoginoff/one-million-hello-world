/**
 * Bpmn Types
 *
 * Type definitions for the BPMN process execution layer.
 */

export interface BpmnContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface BpmnError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BpmnResult<T> {
  success: boolean;
  data?: T;
  error?: BpmnError;
}

export interface BpmnConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
