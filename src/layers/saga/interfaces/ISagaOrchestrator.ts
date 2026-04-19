/**
 * Saga Orchestrator Interface
 * 
 * Defines the contract for orchestrating saga execution
 * in the Saga Layer.
 */

import { SagaStep } from '../types/saga-types';
import { SagaResult } from '../types/saga-types';

export interface OrchestratorConfig {
  enableCompensation: boolean;
  enableLogging: boolean;
}

export interface ISagaOrchestrator {
  /**
   * Orchestrates the execution of a saga
   * 
   * @param steps - Saga steps to execute
   * @param config - Orchestrator configuration
   * @returns Saga result
   */
  orchestrate<T>(steps: SagaStep<T>[], config: OrchestratorConfig): Promise<SagaResult<T>>;

  /**
   * Sets the orchestrator configuration
   * 
   * @param config - New configuration
   */
  setConfig(config: Partial<OrchestratorConfig>): void;

  /**
   * Gets the current orchestrator configuration
   * 
   * @returns Current configuration
   */
  getConfig(): OrchestratorConfig;

  /**
   * Gets the orchestrator name
   * 
   * @returns Orchestrator name
   */
  getOrchestratorName(): string;
}
