/**
 * Execution Metadata Value Object
 * 
 * Represents metadata for strategy execution.
 * Immutable value object for tracking execution performance.
 */

export interface ExecutionMetadataData {
  startTime: number;
  endTime?: number;
  duration: number;
  attemptCount: number;
  lastAttemptTime: number;
  errorMessage?: string;
  retryCount: number;
}

export class ExecutionMetadata {
  readonly data: ExecutionMetadataData;

  constructor(data: ExecutionMetadataData) {
    this.data = { ...data };
  }

  /**
   * Get start time
   */
  getStartTime(): number {
    return this.data.startTime;
  }

  /**
   * Get end time
   */
  getEndTime(): number {
    return this.data.endTime || 0;
  }

  /**
   * Get duration in milliseconds
   */
  getDuration(): number {
    return this.data.duration;
  }

  /**
   * Get attempt count
   */
  getAttemptCount(): number {
    return this.data.attemptCount;
  }

  /**
   * Get last attempt time
   */
  getLastAttemptTime(): number {
    return this.data.lastAttemptTime;
  }

  /**
   * Get error message
   */
  getErrorMessage(): string | undefined {
    return this.data.errorMessage;
  }

  /**
   * Get retry count
   */
  getRetryCount(): number {
    return this.data.retryCount;
  }

  /**
   * Check if execution has error
   */
  hasError(): boolean {
    return !!this.data.errorMessage;
  }

  /**
   * Check if execution was retried
   */
  wasRetried(): boolean {
    return this.data.retryCount > 0;
  }

  /**
   * Create a copy with updated values
   */
  update(updates: Partial<ExecutionMetadataData>): ExecutionMetadata {
    return new ExecutionMetadata({ ...this.data, ...updates });
  }

  /**
   * Create a copy
   */
  clone(): ExecutionMetadata {
    return new ExecutionMetadata({ ...this.data });
  }

  /**
   * Mark as completed
   */
  markAsCompleted(): ExecutionMetadata {
    const endTime = Date.now();
    const duration = endTime - this.data.startTime;
    return this.update({
      endTime,
      duration,
    });
  }

  /**
   * Mark as failed
   */
  markAsFailed(errorMessage: string): ExecutionMetadata {
    const endTime = Date.now();
    const duration = endTime - this.data.startTime;
    return this.update({
      endTime,
      duration,
      errorMessage,
    });
  }

  /**
   * Increment attempt count
   */
  incrementAttemptCount(): ExecutionMetadata {
    return this.update({
      attemptCount: this.data.attemptCount + 1,
      lastAttemptTime: Date.now(),
    });
  }

  /**
   * Increment retry count
   */
  incrementRetryCount(): ExecutionMetadata {
    return this.update({
      retryCount: this.data.retryCount + 1,
    });
  }
}
