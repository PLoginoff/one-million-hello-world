/**
 * Saga Metadata Value Object
 *
 * Represents metadata for saga executions.
 * Immutable value object for tracking saga performance.
 */

export interface SagaMetadataData {
  startTime: number;
  endTime?: number;
  duration: number;
  attemptCount: number;
  lastAttemptTime: number;
  errorMessage?: string;
}

export class SagaMetadata {
  readonly data: SagaMetadataData;

  constructor(data: SagaMetadataData) {
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
   * Check if has error
   */
  hasError(): boolean {
    return !!this.data.errorMessage;
  }

  /**
   * Create a copy with updated values
   */
  update(updates: Partial<SagaMetadataData>): SagaMetadata {
    return new SagaMetadata({ ...this.data, ...updates });
  }

  /**
   * Create a copy
   */
  clone(): SagaMetadata {
    return new SagaMetadata({ ...this.data });
  }

  /**
   * Mark as completed
   */
  markAsCompleted(): SagaMetadata {
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
  markAsFailed(errorMessage: string): SagaMetadata {
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
  incrementAttemptCount(): SagaMetadata {
    return this.update({
      attemptCount: this.data.attemptCount + 1,
      lastAttemptTime: Date.now(),
    });
  }
}
