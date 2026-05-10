/**
 * Attempt Metadata Value Object
 *
 * Represents metadata for retry attempts.
 * Immutable value object for tracking attempt performance.
 */

export interface AttemptMetadataData {
  startTime: number;
  endTime?: number;
  duration: number;
  attemptCount: number;
  lastAttemptTime: number;
  errorMessage?: string;
  retryCount: number;
}

export class AttemptMetadata {
  readonly data: AttemptMetadataData;

  constructor(data: AttemptMetadataData) {
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
   * Check if attempt has error
   */
  hasError(): boolean {
    return !!this.data.errorMessage;
  }

  /**
   * Check if attempt was retried
   */
  wasRetried(): boolean {
    return this.data.retryCount > 0;
  }

  /**
   * Create a copy with updated values
   */
  update(updates: Partial<AttemptMetadataData>): AttemptMetadata {
    return new AttemptMetadata({ ...this.data, ...updates });
  }

  /**
   * Create a copy
   */
  clone(): AttemptMetadata {
    return new AttemptMetadata({ ...this.data });
  }

  /**
   * Mark as completed
   */
  markAsCompleted(): AttemptMetadata {
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
  markAsFailed(errorMessage: string): AttemptMetadata {
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
  incrementAttemptCount(): AttemptMetadata {
    return this.update({
      attemptCount: this.data.attemptCount + 1,
      lastAttemptTime: Date.now(),
    });
  }

  /**
   * Increment retry count
   */
  incrementRetryCount(): AttemptMetadata {
    return this.update({
      retryCount: this.data.retryCount + 1,
    });
  }
}
