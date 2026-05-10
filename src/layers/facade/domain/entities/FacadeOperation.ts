/**
 * Facade Operation Entity
 *
 * Represents a facade operation with metadata.
 * Immutable entity that stores operation data with performance metrics.
 */

import { OperationMetadata } from '../value-objects/index';

export class FacadeOperationEntity {
  readonly operationId: string;
  readonly operationName: string;
  readonly facadeId: string;
  readonly metadata: OperationMetadata;
  readonly parameters: Record<string, unknown>;
  readonly result?: unknown;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  constructor(
    operationId: string,
    operationName: string,
    facadeId: string,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    parameters: Record<string, unknown>,
    metadata?: OperationMetadata,
    result?: unknown,
  ) {
    this.operationId = operationId;
    this.operationName = operationName;
    this.facadeId = facadeId;
    this.status = status;
    this.parameters = { ...parameters };
    this.metadata = metadata || this._createDefaultMetadata();
    this.result = result;
  }

  /**
   * Check if operation is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if operation is running
   */
  isRunning(): boolean {
    return this.status === 'running';
  }

  /**
   * Check if operation is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if operation is failed
   */
  isFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Check if operation is cancelled
   */
  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  /**
   * Check if operation is finished
   */
  isFinished(): boolean {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  }

  /**
   * Get operation duration
   */
  getDuration(): number {
    return this.metadata.getDuration();
  }

  /**
   * Get operation start time
   */
  getStartTime(): number {
    return this.metadata.getStartTime();
  }

  /**
   * Get operation end time
   */
  getEndTime(): number {
    return this.metadata.getEndTime();
  }

  /**
   * Create a copy with updated status
   */
  withStatus(status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'): FacadeOperationEntity {
    return new FacadeOperationEntity(
      this.operationId,
      this.operationName,
      this.facadeId,
      status,
      this.parameters,
      this.metadata,
      this.result,
    );
  }

  /**
   * Create a copy with result
   */
  withResult(result: unknown): FacadeOperationEntity {
    return new FacadeOperationEntity(
      this.operationId,
      this.operationName,
      this.facadeId,
      this.status,
      this.parameters,
      this.metadata,
      result,
    );
  }

  /**
   * Create a copy with updated metadata
   */
  withMetadata(updates: Partial<import('./../value-objects/OperationMetadata').OperationMetadataData>): FacadeOperationEntity {
    return new FacadeOperationEntity(
      this.operationId,
      this.operationName,
      this.facadeId,
      this.status,
      this.parameters,
      this.metadata.update(updates),
      this.result,
    );
  }

  /**
   * Create a copy
   */
  clone(): FacadeOperationEntity {
    return new FacadeOperationEntity(
      this.operationId,
      this.operationName,
      this.facadeId,
      this.status,
      { ...this.parameters },
      this.metadata.clone(),
      this.result,
    );
  }

  private _createDefaultMetadata(): OperationMetadata {
    return new OperationMetadata({
      startTime: Date.now(),
      duration: 0,
      attemptCount: 1,
      lastAttemptTime: Date.now(),
      retryCount: 0,
    });
  }
}
