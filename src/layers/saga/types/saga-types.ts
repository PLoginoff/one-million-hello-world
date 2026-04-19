/**
 * Saga Layer Types
 * 
 * This module defines all type definitions for the Saga Layer,
 * including distributed transactions and compensation.
 */

/**
 * Saga step
 */
export interface SagaStep<T = unknown> {
  name: string;
  execute: () => Promise<T>;
  compensate: (data: T) => Promise<void>;
}

/**
 * Saga result
 */
export interface SagaResult<T> {
  success: boolean;
  data?: T;
  executedSteps: string[];
  compensatedSteps: string[];
  error?: string;
}

/**
 * Saga configuration
 */
export interface SagaConfig {
  enableLogging: boolean;
  enableCompensation: boolean;
}

/**
 * Saga execution data
 */
export interface SagaExecutionData<T> {
  stepName: string;
  data: T;
  stepIndex: number;
}

/**
 * Saga metrics
 */
export interface SagaMetrics {
  totalSteps: number;
  executedSteps: number;
  compensatedSteps: number;
  failedSteps: number;
  duration: number;
}
