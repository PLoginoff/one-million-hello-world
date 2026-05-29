/**
 * Retry Saga Use Case
 *
 * Application use case for retrying a saga execution.
 * Contains business logic for retry workflow with backoff strategies.
 */

import { SagaExecutionEntity } from '../../domain/entities/SagaExecution';
import { SagaConfig } from '../../domain/value-objects/SagaConfig';

export class RetrySagaUseCase {
  /**
   * Retry a failed saga execution
   */
  async retry(
    execution: SagaExecutionEntity,
    config: SagaConfig,
  ): Promise<SagaExecutionEntity> {
    if (!execution.isFailed()) {
      throw new Error('Can only retry failed executions');
    }

    const retryPolicy = config.getRetryPolicy();
    const currentAttempts = execution.metadata.getAttemptCount();

    if (currentAttempts >= retryPolicy.maxAttempts) {
      throw new Error(`Max retry attempts (${retryPolicy.maxAttempts}) exceeded`);
    }

    const delay = this._calculateDelay(retryPolicy, currentAttempts);
    await this._sleep(delay);

    const updatedExecution = execution
      .withStatus('pending')
      .withMetadata({
        attemptCount: currentAttempts + 1,
        lastAttemptTime: Date.now(),
      });

    return updatedExecution;
  }

  /**
   * Retry a specific step
   */
  async retryStep(
    execution: SagaExecutionEntity,
    stepId: string,
    config: SagaConfig,
  ): Promise<SagaExecutionEntity> {
    const step = execution.steps.find(s => s.stepId === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    if (step.status !== 'failed') {
      throw new Error(`Step ${stepId} is not in failed state`);
    }

    const retryPolicy = config.getRetryPolicy();
    const delay = this._calculateDelay(retryPolicy, execution.metadata.getAttemptCount());
    await this._sleep(delay);

    const updatedSteps = execution.steps.map(s =>
      s.stepId === stepId ? { ...s, status: 'pending', error: undefined } : s
    );

    return execution.withMetadata({
      steps: updatedSteps,
      attemptCount: execution.metadata.getAttemptCount() + 1,
      lastAttemptTime: Date.now(),
    });
  }

  /**
   * Check if retry is possible
   */
  canRetry(execution: SagaExecutionEntity, config: SagaConfig): boolean {
    if (!execution.isFailed() && !execution.isCompensating()) {
      return false;
    }

    const retryPolicy = config.getRetryPolicy();
    return execution.metadata.getAttemptCount() < retryPolicy.maxAttempts;
  }

  /**
   * Get remaining retry attempts
   */
  getRemainingAttempts(execution: SagaExecutionEntity, config: SagaConfig): number {
    const retryPolicy = config.getRetryPolicy();
    return retryPolicy.maxAttempts - execution.metadata.getAttemptCount();
  }

  private _calculateDelay(retryPolicy: any, attempt: number): number {
    let delay: number;

    switch (retryPolicy.backoffStrategy) {
      case 'exponential':
        delay = retryPolicy.initialDelay * Math.pow(retryPolicy.multiplier, attempt);
        break;
      case 'linear':
        delay = retryPolicy.initialDelay + (retryPolicy.initialDelay * attempt);
        break;
      default:
        delay = retryPolicy.initialDelay;
    }

    return Math.min(delay, retryPolicy.maxDelay);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
