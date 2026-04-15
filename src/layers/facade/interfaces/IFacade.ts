/**
 * Facade Interface
 * 
 * Defines the contract for facade operations
 * including simplified interfaces, aggregation, and composition.
 */

import { FacadeResult, FacadeConfig } from '../types/facade-types';

/**
 * Interface for facade operations
 */
export interface IFacade {
  /**
   * Executes multiple operations in sequence
   * 
   * @param operations - Operations to execute
   * @returns Facade result
   */
  execute<T>(operations: (() => Promise<T>)[]): Promise<FacadeResult<T[]>>;

  /**
   * Sets facade configuration
   * 
   * @param config - Facade configuration
   */
  setConfig(config: FacadeConfig): void;

  /**
   * Gets current facade configuration
   * 
   * @returns Current facade configuration
   */
  getConfig(): FacadeConfig;
}
