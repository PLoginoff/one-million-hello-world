/**
 * Orchestrator Pattern
 *
 * Centralized saga orchestration pattern.
 * Single coordinator manages saga execution flow.
 */

import { SagaExecutionEntity } from '../domain/entities/SagaExecution';
import { SagaConfig } from '../domain/value-objects/SagaConfig';

export class OrchestratorPattern {
  private readonly _orchestrator: SagaOrchestrator;

  constructor() {
    this._orchestrator = new SagaOrchestrator();
  }

  /**
   * Execute saga with orchestrator pattern
   */
  async execute(sagaId: string, config: SagaConfig, steps: any[]): Promise<SagaExecutionEntity> {
    return this._orchestrator.execute(sagaId, config, steps);
  }

  /**
   * Compensate saga
   */
  async compensate(execution: SagaExecutionEntity): Promise<SagaExecutionEntity> {
    return this._orchestrator.compensate(execution);
  }
}

class SagaOrchestrator {
  async execute(sagaId: string, config: SagaConfig, steps: any[]): Promise<SagaExecutionEntity> {
    const executionId = `exec_${Date.now()}`;
    return new SagaExecutionEntity(
      executionId,
      sagaId,
      'pending',
      steps,
      [],
    );
  }

  async compensate(execution: SagaExecutionEntity): Promise<SagaExecutionEntity> {
    return execution.withStatus('compensating');
  }
}
