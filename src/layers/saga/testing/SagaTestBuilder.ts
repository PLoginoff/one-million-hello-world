/**
 * Saga Test Builder
 *
 * Builder for creating test saga executions.
 * Provides convenient methods for building test scenarios.
 */

import { SagaExecutionEntity, SagaStep, CompensationStep } from '../domain/entities/SagaExecution';
import { SagaMetadata } from '../domain/value-objects/SagaMetadata';

export class SagaTestBuilder {
  private _executionId: string;
  private _sagaId: string;
  private _status: 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated';
  private _steps: SagaStep[];
  private _compensationSteps: CompensationStep[];
  private _metadata: SagaMetadata;

  constructor() {
    this._executionId = 'test-execution-1';
    this._sagaId = 'test-saga-1';
    this._status = 'pending';
    this._steps = [];
    this._compensationSteps = [];
    this._metadata = new SagaMetadata({
      startTime: Date.now(),
      duration: 0,
      attemptCount: 1,
      lastAttemptTime: Date.now(),
    });
  }

  /**
   * Set execution ID
   */
  withExecutionId(id: string): SagaTestBuilder {
    this._executionId = id;
    return this;
  }

  /**
   * Set saga ID
   */
  withSagaId(id: string): SagaTestBuilder {
    this._sagaId = id;
    return this;
  }

  /**
   * Set status
   */
  withStatus(status: 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated'): SagaTestBuilder {
    this._status = status;
    return this;
  }

  /**
   * Add step
   */
  addStep(step: SagaStep): SagaTestBuilder {
    this._steps.push(step);
    return this;
  }

  /**
   * Add compensation step
   */
  addCompensationStep(step: CompensationStep): SagaTestBuilder {
    this._compensationSteps.push(step);
    return this;
  }

  /**
   * Set metadata
   */
  withMetadata(metadata: SagaMetadata): SagaTestBuilder {
    this._metadata = metadata;
    return this;
  }

  /**
   * Build execution
   */
  build(): SagaExecutionEntity {
    return new SagaExecutionEntity(
      this._executionId,
      this._sagaId,
      this._status,
      this._steps,
      this._compensationSteps,
      this._metadata
    );
  }

  /**
   * Create completed execution
   */
  static createCompleted(): SagaExecutionEntity {
    return new SagaTestBuilder()
      .withStatus('completed')
      .addStep({ stepId: 'step-1', name: 'step-1', status: 'completed' })
      .build();
  }

  /**
   * Create failed execution
   */
  static createFailed(): SagaExecutionEntity {
    return new SagaTestBuilder()
      .withStatus('failed')
      .addStep({ stepId: 'step-1', name: 'step-1', status: 'completed' })
      .addStep({ stepId: 'step-2', name: 'step-2', status: 'failed' })
      .build();
  }

  /**
   * Create compensating execution
   */
  static createCompensating(): SagaExecutionEntity {
    return new SagaTestBuilder()
      .withStatus('compensating')
      .addStep({ stepId: 'step-1', name: 'step-1', status: 'completed' })
      .addStep({ stepId: 'step-2', name: 'step-2', status: 'failed' })
      .addCompensationStep({ stepId: 'comp-1', originalStepId: 'step-1', name: 'comp-1', status: 'pending' })
      .build();
  }
}
