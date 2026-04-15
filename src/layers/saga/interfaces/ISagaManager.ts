/**
 * Saga Manager Interface
 * 
 * Defines the contract for saga operations
 * including distributed transactions and compensation.
 */

import { SagaStep, SagaResult, SagaConfig } from '../types/saga-types';

/**
 * Interface for saga operations
 */
export interface ISagaManager {
  /**
   * Executes a saga with compensation
   * 
   * @param steps - Saga steps to execute
   * @returns Saga result
   */
  execute<T>(steps: SagaStep<T>[]): Promise<SagaResult<T>>;

  /**
   * Sets saga configuration
   * 
   * @param config - Saga configuration
   */
  setConfig(config: SagaConfig): void;

  /**
   * Gets current saga configuration
   * 
   * @returns Current saga configuration
   */
  getConfig(): SagaConfig;
}
