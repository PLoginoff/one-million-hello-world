/**
 * Compensation Orchestrator Interface
 * 
 * Defines the contract for orchestrating compensation
 * in the Saga Layer.
 */

import { SagaStep } from '../types/saga-types';
import { ISagaState } from './ISagaState';
import { OrchestratorConfig } from './ISagaOrchestrator';

export interface CompensationResult {
  compensatedSteps: string[];
  failedSteps: string[];
  success: boolean;
  error?: string;
}

export interface ICompensationOrchestrator {
  /**
   * Orchestrates the compensation process
   * 
   * @param steps - Saga steps to compensate
   * @param sagaState - Current saga state
   * @param config - Orchestrator configuration
   * @returns Compensation result
   */
  orchestrateCompensation<T>(
    steps: SagaStep<T>[],
    sagaState: ISagaState,
    config: OrchestratorConfig,
  ): Promise<CompensationResult>;

  /**
   * Gets the orchestrator name
   * 
   * @returns Orchestrator name
   */
  getOrchestratorName(): string;
}
