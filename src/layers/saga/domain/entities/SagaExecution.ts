/**
 * Saga Execution Entity
 *
 * Represents a saga execution with metadata.
 * Immutable entity that stores saga execution data with performance metrics.
 */

import { SagaMetadata } from '../value-objects/index';

export class SagaExecutionEntity {
  readonly executionId: string;
  readonly sagaId: string;
  readonly metadata: SagaMetadata;
  readonly steps: SagaStep[];
  readonly compensationSteps: CompensationStep[];
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated';
  readonly result?: unknown;
  readonly error?: Error;

  constructor(
    executionId: string,
    sagaId: string,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated',
    steps: SagaStep[],
    compensationSteps: CompensationStep[],
    metadata?: SagaMetadata,
    result?: unknown,
    error?: Error,
  ) {
    this.executionId = executionId;
    this.sagaId = sagaId;
    this.status = status;
    this.steps = steps;
    this.compensationSteps = compensationSteps;
    this.metadata = metadata || this._createDefaultMetadata();
    this.result = result;
    this.error = error;
  }

  /**
   * Check if execution is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if execution is running
   */
  isRunning(): boolean {
    return this.status === 'running';
  }

  /**
   * Check if execution is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if execution is failed
   */
  isFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Check if execution is compensating
   */
  isCompensating(): boolean {
    return this.status === 'compensating';
  }

  /**
   * Check if execution is compensated
   */
  isCompensated(): boolean {
    return this.status === 'compensated';
  }

  /**
   * Get execution duration
   */
  getDuration(): number {
    return this.metadata.getDuration();
  }

  /**
   * Get completed steps count
   */
  getCompletedStepsCount(): number {
    return this.steps.filter((s) => s.status === 'completed').length;
  }

  /**
   * Get failed steps count
   */
  getFailedStepsCount(): number {
    return this.steps.filter((s) => s.status === 'failed').length;
  }

  /**
   * Create a copy with updated status
   */
  withStatus(status: 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated'): SagaExecutionEntity {
    return new SagaExecutionEntity(
      this.executionId,
      this.sagaId,
      status,
      this.steps,
      this.compensationSteps,
      this.metadata,
      this.result,
      this.error,
    );
  }

  /**
   * Create a copy with result
   */
  withResult(result: unknown): SagaExecutionEntity {
    return new SagaExecutionEntity(
      this.executionId,
      this.sagaId,
      this.status,
      this.steps,
      this.compensationSteps,
      this.metadata,
      result,
      this.error,
    );
  }

  /**
   * Create a copy with error
   */
  withError(error: Error): SagaExecutionEntity {
    return new SagaExecutionEntity(
      this.executionId,
      this.sagaId,
      this.status,
      this.steps,
      this.compensationSteps,
      this.metadata,
      this.result,
      error,
    );
  }

  /**
   * Create a copy with updated metadata
   */
  withMetadata(updates: Partial<import('./../value-objects/SagaMetadata').SagaMetadataData>): SagaExecutionEntity {
    return new SagaExecutionEntity(
      this.executionId,
      this.sagaId,
      this.status,
      this.steps,
      this.compensationSteps,
      this.metadata.update(updates),
      this.result,
      this.error,
    );
  }

  /**
   * Create a copy
   */
  clone(): SagaExecutionEntity {
    return new SagaExecutionEntity(
      this.executionId,
      this.sagaId,
      this.status,
      [...this.steps],
      [...this.compensationSteps],
      this.metadata.clone(),
      this.result,
      this.error,
    );
  }

  private _createDefaultMetadata(): SagaMetadata {
    return new SagaMetadata({
      startTime: Date.now(),
      duration: 0,
      attemptCount: 1,
      lastAttemptTime: Date.now(),
    });
  }
}

export interface SagaStep {
  stepId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: Error;
  startedAt?: number;
  completedAt?: number;
}

export interface CompensationStep {
  stepId: string;
  originalStepId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: Error;
  startedAt?: number;
  completedAt?: number;
}
