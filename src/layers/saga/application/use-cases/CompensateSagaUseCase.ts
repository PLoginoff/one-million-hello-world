/**
 * Compensate Saga Use Case
 *
 * Application use case for compensating a saga.
 * Contains business logic for compensation workflow.
 */

import { SagaExecutionEntity, CompensationStep } from '../../domain/entities/SagaExecution';

export class CompensateSagaUseCase {
  /**
   * Execute compensation for a specific step
   */
  compensateStep(execution: SagaExecutionEntity, stepId: string): Promise<SagaExecutionEntity> {
    const compensationStep = execution.compensationSteps.find((s) => s.originalStepId === stepId);
    if (!compensationStep) {
      throw new Error(`No compensation step for ${stepId}`);
    }

    return Promise.resolve(
      execution.withStatus('compensating').withMetadata({
        lastAttemptTime: Date.now(),
      })
    );
  }

  /**
   * Complete compensation for a step
   */
  completeCompensationStep(
    execution: SagaExecutionEntity,
    _stepId: string,
    _result?: unknown
  ): Promise<SagaExecutionEntity> {
    return Promise.resolve(
      execution
        .withMetadata({
          lastAttemptTime: Date.now(),
        })
        .withStatus('compensating')
    );
  }

  /**
   * Fail compensation for a step
   */
  failCompensationStep(execution: SagaExecutionEntity, stepId: string, error: Error): Promise<SagaExecutionEntity> {
    return Promise.resolve(
      execution.withMetadata({
        errorMessage: `Compensation failed for ${stepId}: ${error.message}`,
      })
    );
  }

  /**
   * Skip compensation for a step
   */
  skipCompensationStep(execution: SagaExecutionEntity): Promise<SagaExecutionEntity> {
    return Promise.resolve(
      execution.withMetadata({
        lastAttemptTime: Date.now(),
      })
    );
  }

  /**
   * Check if compensation is complete
   */
  isCompensationComplete(execution: SagaExecutionEntity): boolean {
    return execution.compensationSteps.every((s) => s.status === 'completed' || s.status === 'skipped');
  }

  /**
   * Get remaining compensation steps
   */
  getRemainingCompensationSteps(execution: SagaExecutionEntity): CompensationStep[] {
    return execution.compensationSteps.filter((s) => s.status === 'pending');
  }

  /**
   * Get failed compensation steps
   */
  getFailedCompensationSteps(execution: SagaExecutionEntity): CompensationStep[] {
    return execution.compensationSteps.filter((s) => s.status === 'failed');
  }
}
