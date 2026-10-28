/**
 * Saga Strategy Interface
 *
 * Defines the contract for saga execution strategies.
 * Implementations provide different approaches to executing distributed
 * transactions with compensation support.
 *
 * @module SagaLayer/Strategies
 */

import { SagaConfig, SagaStep } from '../types/saga-types';

/**
 * Context object for saga strategy execution
 */
export interface SagaContext<T> {
  /** The steps to execute in the saga */
  steps: SagaStep<T>[];
  /** Saga configuration */
  config: SagaConfig;
  /** Current step index (0-based) */
  currentStepIndex: number;
  /** Data from previous steps */
  stepData: Map<string, T>;
  /** Whether compensation is enabled */
  enableCompensation: boolean;
}

/**
 * Result of saga strategy execution
 */
export interface SagaStrategyResult<T> {
  /** Whether the execution was successful */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Names of executed steps */
  executedSteps: string[];
  /** Names of compensated steps */
  compensatedSteps: string[];
  /** Total execution duration in milliseconds */
  durationMs: number;
  /** Duration of each step in milliseconds */
  stepDurationsMs: Map<string, number>;
}

/**
 * Interface for saga execution strategies
 *
 * @typeParam T - The type of result returned by the saga
 */
export interface ISagaStrategy<T = unknown> {
  /** Unique strategy name */
  readonly name: string;
  /** Strategy priority (higher = more preferred) */
  readonly priority: number;

  /**
   * Executes a saga with the given steps
   *
   * @param context - Execution context containing steps, config, and state
   * @returns Strategy execution result
   */
  execute(context: SagaContext<T>): Promise<SagaStrategyResult<T>>;

  /**
   * Determines if this strategy can handle the given context
   *
   * @param context - Execution context to evaluate
   * @returns True if strategy can handle the context
   */
  canHandle(context: SagaContext<unknown>): boolean;

  /**
   * Compensates executed steps in case of failure
   *
   * @param context - Execution context with executed steps
   * @param executedSteps - Names of steps that were executed
   * @param stepData - Data from executed steps
   * @returns Array of compensation results
   */
  compensate(
    context: SagaContext<T>,
    executedSteps: string[],
    stepData: Map<string, T>
  ): Promise<Array<{ stepName: string; success: boolean; error?: string }>>;
}
