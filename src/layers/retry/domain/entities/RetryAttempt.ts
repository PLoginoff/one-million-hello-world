/**
 * Retry Attempt Entity
 *
 * Represents a retry attempt with metadata.
 * Immutable entity that stores retry attempt data with performance metrics.
 */

import { AttemptMetadata } from '../value-objects/index';

export class RetryAttemptEntity {
  readonly attemptId: string;
  readonly retryId: string;
  readonly attemptNumber: number;
  readonly metadata: AttemptMetadata;
  readonly parameters: Record<string, unknown>;
  readonly result?: unknown;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  constructor(
    attemptId: string,
    retryId: string,
    attemptNumber: number,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    parameters: Record<string, unknown>,
    metadata?: AttemptMetadata,
    result?: unknown,
  ) {
    this.attemptId = attemptId;
    this.retryId = retryId;
    this.attemptNumber = attemptNumber;
    this.status = status;
    this.parameters = { ...parameters };
    this.metadata = metadata || this._createDefaultMetadata();
    this.result = result;
  }

  /**
   * Check if attempt is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if attempt is running
   */
  isRunning(): boolean {
    return this.status === 'running';
  }

  /**
   * Check if attempt is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if attempt is failed
   */
  isFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Check if attempt is cancelled
   */
  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  /**
   * Check if attempt is finished
   */
  isFinished(): boolean {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  }

  /**
   * Get attempt duration
   */
  getDuration(): number {
    return this.metadata.getDuration();
  }

  /**
   * Get attempt start time
   */
  getStartTime(): number {
    return this.metadata.getStartTime();
  }

  /**
   * Get attempt end time
   */
  getEndTime(): number {
    return this.metadata.getEndTime();
  }

  /**
   * Create a copy with updated status
   */
  withStatus(status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'): RetryAttemptEntity {
    return new RetryAttemptEntity(
      this.attemptId,
      this.retryId,
      this.attemptNumber,
      status,
      this.parameters,
      this.metadata,
      this.result,
    );
  }

  /**
   * Create a copy with result
   */
  withResult(result: unknown): RetryAttemptEntity {
    return new RetryAttemptEntity(
      this.attemptId,
      this.retryId,
      this.attemptNumber,
      this.status,
      this.parameters,
      this.metadata,
      result,
    );
  }

  /**
   * Create a copy with updated metadata
   */
  withMetadata(updates: Partial<import('./../value-objects/AttemptMetadata').AttemptMetadataData>): RetryAttemptEntity {
    return new RetryAttemptEntity(
      this.attemptId,
      this.retryId,
      this.attemptNumber,
      this.status,
      this.parameters,
      this.metadata.update(updates),
      this.result,
    );
  }

  /**
   * Create a copy
   */
  clone(): RetryAttemptEntity {
    return new RetryAttemptEntity(
      this.attemptId,
      this.retryId,
      this.attemptNumber,
      this.status,
      { ...this.parameters },
      this.metadata.clone(),
      this.result,
    );
  }

  private _createDefaultMetadata(): AttemptMetadata {
    return new AttemptMetadata({
      startTime: Date.now(),
      duration: 0,
      attemptCount: 1,
      lastAttemptTime: Date.now(),
      retryCount: 0,
    });
  }
}
