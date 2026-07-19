/**
 * Execute Saga Use Case
 *
 * Application use case for executing a saga.
 * Contains business logic for saga execution workflow.
 */

import { SagaExecutionEntity, SagaStep, CompensationStep } from '../../domain/entities/SagaExecution';
import { SagaConfig } from '../../domain/value-objects/SagaConfig';
import { SagaStepDefinition } from '../../domain/value-objects/SagaStepDefinition';
import { SagaValidationService, ValidationError } from '../../domain/services/SagaValidationService';

export class ExecuteSagaUseCase {
  private readonly _validationService: SagaValidationService;

  constructor() {
    this._validationService = new SagaValidationService();
  }

  /**
   * Execute a saga with given steps
   */
  async execute(sagaId: string, config: SagaConfig, steps: SagaStepDefinition[]): Promise<SagaExecutionEntity> {
    const executionId = this._generateExecutionId();
    const execution = new SagaExecutionEntity(
      executionId,
      sagaId,
      'pending',
      this._createSagaSteps(steps),
      this._createCompensationSteps(steps)
    );

    const configValidation = this._validationService.validateSagaConfig(config);
    if (!configValidation.isValid) {
      throw new Error(
        `Invalid saga config: ${configValidation.errors.map((e: ValidationError) => e.message).join(', ')}`
      );
    }

    for (const step of steps) {
      const stepValidation = this._validationService.validateSagaStepDefinition(step);
      if (!stepValidation.isValid) {
        throw new Error(
          `Invalid step ${step.getStepId()}: ${stepValidation.errors.map((e: ValidationError) => e.message).join(', ')}`
        );
      }
    }

    return Promise.resolve(execution.withStatus('running').withMetadata({ startTime: Date.now() }));
  }

  /**
   * Execute a single step
   */
  executeStep(execution: SagaExecutionEntity, stepId: string): Promise<SagaExecutionEntity> {
    const step = execution.steps.find((s) => s.stepId === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    return Promise.resolve(
      execution.withStatus('running').withMetadata({
        lastAttemptTime: Date.now(),
      })
    );
  }

  /**
   * Compensate a failed saga
   */
  compensate(execution: SagaExecutionEntity): Promise<SagaExecutionEntity> {
    if (!execution.isFailed() && !execution.isCompensating()) {
      throw new Error('Can only compensate failed or compensating sagas');
    }

    return Promise.resolve(execution.withStatus('compensating'));
  }

  /**
   * Complete a saga
   */
  complete(execution: SagaExecutionEntity, result?: unknown): Promise<SagaExecutionEntity> {
    const completedExecution = execution.withStatus('completed').withResult(result);
    return Promise.resolve(
      completedExecution.withMetadata({
        endTime: Date.now(),
        duration: Date.now() - execution.metadata.getStartTime(),
      })
    );
  }

  /**
   * Fail a saga
   */
  fail(execution: SagaExecutionEntity, error: Error): Promise<SagaExecutionEntity> {
    const failedExecution = execution.withStatus('failed').withError(error);
    return Promise.resolve(
      failedExecution.withMetadata({
        endTime: Date.now(),
        duration: Date.now() - execution.metadata.getStartTime(),
        errorMessage: error.message,
      })
    );
  }

  private _generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _createSagaSteps(definitions: SagaStepDefinition[]): SagaStep[] {
    return definitions.map((def) => ({
      stepId: def.getStepId(),
      name: def.getName(),
      status: 'pending' as const,
    }));
  }

  private _createCompensationSteps(definitions: SagaStepDefinition[]): CompensationStep[] {
    return definitions
      .filter((def) => def.hasCompensation())
      .map((def) => ({
        stepId: `comp_${def.getStepId()}`,
        originalStepId: def.getStepId(),
        name: `Compensate ${def.getName()}`,
        status: 'pending' as const,
      }));
  }
}
