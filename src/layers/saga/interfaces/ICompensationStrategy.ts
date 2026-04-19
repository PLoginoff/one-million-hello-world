/**
 * Compensation Strategy Interface
 * 
 * Defines the contract for compensation strategies
 * in the Saga Layer.
 */

import { SagaStep } from '../types/saga-types';

export interface CompensationContext<T> {
  step: SagaStep<T>;
  data: T;
  stepIndex: number;
  totalSteps: number;
}

export interface CompensationResult {
  stepName: string;
  success: boolean;
  error?: string;
}

export interface ICompensationStrategy {
  /**
   * Executes compensation for a single step
   * 
   * @param context - Compensation context
   * @returns Compensation result
   */
  compensateStep<T>(context: CompensationContext<T>): Promise<CompensationResult>;

  /**
   * Executes compensation for multiple steps
   * 
   * @param contexts - Array of compensation contexts
   * @returns Array of compensation results
   */
  compensateSteps<T>(contexts: CompensationContext<T>[]): Promise<CompensationResult[]>;

  /**
   * Determines if compensation should continue after an error
   * 
   * @param error - Error that occurred
   * @param context - Compensation context
   * @returns Whether to continue compensation
   */
  shouldContinueOnError(error: Error, context: CompensationContext<unknown>): boolean;

  /**
   * Gets the strategy name
   * 
   * @returns Strategy name
   */
  getStrategyName(): string;
}
