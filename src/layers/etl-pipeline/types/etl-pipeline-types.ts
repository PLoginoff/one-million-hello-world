/**
 * EtlPipeline Types
 *
 * Type definitions for the ETL pipeline orchestration layer.
 */

export interface EtlPipelineContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface EtlPipelineError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface EtlPipelineResult<T> {
  success: boolean;
  data?: T;
  error?: EtlPipelineError;
}

export interface EtlPipelineConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
