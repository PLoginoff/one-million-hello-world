/**
 * Step Executor Interface
 * 
 * Defines the contract for executing saga steps
 * in the Saga Layer.
 */

import { SagaStep } from '../types/saga-types';

export interface StepExecutionContext<T> {
  step: SagaStep<T>;
  stepIndex: number;
  totalSteps: number;
}

export interface StepExecutionResult<T> {
  stepName: string;
  success: boolean;
  data?: T;
  error?: string;
  stepIndex: number;
}

export interface IStepExecutor {
  /**
   * Executes a single saga step
   * 
   * @param context - Step execution context
   * @returns Step execution result
   */
  executeStep<T>(context: StepExecutionContext<T>): Promise<StepExecutionResult<T>>;

  /**
   * Executes multiple saga steps sequentially
   * 
   * @param contexts - Array of step execution contexts
   * @returns Array of step execution results
   */
  executeSteps<T>(contexts: StepExecutionContext<T>[]): Promise<StepExecutionResult<T>[]>;

  /**
   * Determines if execution should continue after an error
   * 
   * @param error - Error that occurred
   * @param context - Step execution context
   * @returns Whether to continue execution
   */
  shouldContinueOnError(error: Error, context: StepExecutionContext<unknown>): boolean;

  /**
   * Gets the executor name
   * 
   * @returns Executor name
   */
  getExecutorName(): string;
}
