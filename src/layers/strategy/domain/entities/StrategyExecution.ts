/**
 * Strategy Execution Entity
 * 
 * Represents the execution of a strategy with metadata.
 * Immutable entity that stores strategy execution data with performance metrics.
 */

import { ExecutionMetadata } from '../value-objects/ExecutionMetadata';

export class StrategyExecutionEntity {
  readonly strategyId: string;
  readonly strategyName: string;
  readonly executionId: string;
  readonly metadata: ExecutionMetadata;
  readonly parameters: Record<string, unknown>;
  readonly result?: unknown;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  constructor(
    strategyId: string,
    strategyName: string,
    executionId: string,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    parameters: Record<string, unknown>,
    metadata?: ExecutionMetadata,
    result?: unknown,
  ) {
    this.strategyId = strategyId;
    this.strategyName = strategyName;
    this.executionId = executionId;
    this.status = status;
    this.parameters = { ...parameters };
    this.metadata = metadata || this._createDefaultMetadata();
    this.result = result;
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
   * Check if execution is cancelled
   */
  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  /**
   * Check if execution is finished (completed, failed, or cancelled)
   */
  isFinished(): boolean {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  }

  /**
   * Get execution duration in milliseconds
   */
  getDuration(): number {
    return this.metadata.duration;
  }

  /**
   * Get execution start time
   */
  getStartTime(): number {
    return this.metadata.startTime;
  }

  /**
   * Get execution end time
   */
  getEndTime(): number {
    return this.metadata.endTime || 0;
  }

  /**
   * Create a copy with updated status
   */
  withStatus(status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'): StrategyExecutionEntity {
    return new StrategyExecutionEntity(
      this.strategyId,
      this.strategyName,
      this.executionId,
      status,
      this.parameters,
      this.metadata,
      this.result,
    );
  }

  /**
   * Create a copy with result
   */
  withResult(result: unknown): StrategyExecutionEntity {
    return new StrategyExecutionEntity(
      this.strategyId,
      this.strategyName,
      this.executionId,
      this.status,
      this.parameters,
      this.metadata,
      result,
    );
  }

  /**
   * Create a copy with updated metadata
   */
  withMetadata(updates: Partial<ExecutionMetadata>): StrategyExecutionEntity {
    return new StrategyExecutionEntity(
      this.strategyId,
      this.strategyName,
      this.executionId,
      this.status,
      this.parameters,
      this.metadata.update(updates),
      this.result,
    );
  }

  /**
   * Create a copy
   */
  clone(): StrategyExecutionEntity {
    return new StrategyExecutionEntity(
      this.strategyId,
      this.strategyName,
      this.executionId,
      this.status,
      { ...this.parameters },
      this.metadata.clone(),
      this.result,
    );
  }

  private _createDefaultMetadata(): ExecutionMetadata {
    return new ExecutionMetadata({
      startTime: Date.now(),
      duration: 0,
      attemptCount: 1,
      lastAttemptTime: Date.now(),
      retryCount: 0,
    });
  }
}
