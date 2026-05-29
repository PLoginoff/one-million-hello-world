/**
 * Retry Condition Value Object
 *
 * Represents retry condition logic.
 * Immutable value object for determining when to retry.
 */

export interface RetryConditionData {
  retryableErrors: string[];
  retryableStatusCodes: number[];
  customCondition?: (error: Error, attempt: number) => boolean;
  maxRetryableErrors: number;
  timeLimit?: number;
}

export class RetryCondition {
  readonly data: RetryConditionData;

  constructor(data: RetryConditionData) {
    this._validateCondition(data);
    this.data = { ...data, retryableErrors: [...data.retryableErrors], retryableStatusCodes: [...data.retryableStatusCodes] };
  }

  /**
   * Get retryable errors
   */
  getRetryableErrors(): string[] {
    return [...this.data.retryableErrors];
  }

  /**
   * Get retryable status codes
   */
  getRetryableStatusCodes(): number[] {
    return [...this.data.retryableStatusCodes];
  }

  /**
   * Get custom condition
   */
  getCustomCondition(): ((error: Error, attempt: number) => boolean) | undefined {
    return this.data.customCondition;
  }

  /**
   * Get max retryable errors
   */
  getMaxRetryableErrors(): number {
    return this.data.maxRetryableErrors;
  }

  /**
   * Get time limit
   */
  getTimeLimit(): number | undefined {
    return this.data.timeLimit;
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error: Error): boolean {
    if (this.data.retryableErrors.length === 0) {
      return true;
    }

    return this.data.retryableErrors.some((errType) => error.name === errType || error.constructor.name === errType);
  }

  /**
   * Check if status code is retryable
   */
  isRetryableStatusCode(statusCode: number): boolean {
    if (this.data.retryableStatusCodes.length === 0) {
      return true;
    }

    return this.data.retryableStatusCodes.includes(statusCode);
  }

  /**
   * Check if should retry based on custom condition
   */
  shouldRetryCustom(error: Error, attempt: number): boolean {
    if (!this.data.customCondition) {
      return true;
    }

    return this.data.customCondition(error, attempt);
  }

  /**
   * Check if within time limit
   */
  isWithinTimeLimit(startTime: number): boolean {
    if (!this.data.timeLimit) {
      return true;
    }

    const elapsed = Date.now() - startTime;
    return elapsed < this.data.timeLimit;
  }

  /**
   * Check if should retry
   */
  shouldRetry(error: Error, attempt: number, startTime: number, statusCode?: number): boolean {
    if (!this.isWithinTimeLimit(startTime)) {
      return false;
    }

    if (!this.isRetryableError(error)) {
      return false;
    }

    if (statusCode !== undefined && !this.isRetryableStatusCode(statusCode)) {
      return false;
    }

    if (!this.shouldRetryCustom(error, attempt)) {
      return false;
    }

    return true;
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<RetryConditionData>): RetryCondition {
    return new RetryCondition({ ...this.data, ...updates });
  }

  /**
   * Create default condition
   */
  static createDefault(): RetryCondition {
    return new RetryCondition({
      retryableErrors: [],
      retryableStatusCodes: [],
      maxRetryableErrors: -1,
    });
  }

  /**
   * Create network error condition
   */
  static createNetworkErrorCondition(): RetryCondition {
    return new RetryCondition({
      retryableErrors: ['NetworkError', 'TimeoutError', 'ECONNREFUSED', 'ETIMEDOUT'],
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      maxRetryableErrors: -1,
      timeLimit: 60000,
    });
  }

  private _validateCondition(data: RetryConditionData): void {
    if (data.maxRetryableErrors < -1) {
      throw new Error('Max retryable errors must be -1 (unlimited) or non-negative');
    }

    if (data.timeLimit !== undefined && data.timeLimit < 0) {
      throw new Error('Time limit must be non-negative');
    }
  }
}
