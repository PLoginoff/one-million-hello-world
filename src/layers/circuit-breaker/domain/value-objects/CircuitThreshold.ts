/**
 * Circuit Threshold Value Object
 * 
 * Represents circuit breaker threshold configuration.
 * Immutable value object for threshold management.
 */

export interface CircuitThresholdData {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
  slidingWindowSize: number;
  minimumRequests: number;
}

export class CircuitThreshold {
  readonly data: CircuitThresholdData;

  constructor(data: CircuitThresholdData) {
    this._validateThreshold(data);
    this.data = { ...data };
  }

  /**
   * Get failure threshold
   */
  getFailureThreshold(): number {
    return this.data.failureThreshold;
  }

  /**
   * Get success threshold
   */
  getSuccessThreshold(): number {
    return this.data.successThreshold;
  }

  /**
   * Get timeout
   */
  getTimeout(): number {
    return this.data.timeout;
  }

  /**
   * Get reset timeout
   */
  getResetTimeout(): number {
    return this.data.resetTimeout;
  }

  /**
   * Get sliding window size
   */
  getSlidingWindowSize(): number {
    return this.data.slidingWindowSize;
  }

  /**
   * Get minimum requests
   */
  getMinimumRequests(): number {
    return this.data.minimumRequests;
  }

  /**
   * Check if failure threshold is exceeded
   */
  isFailureThresholdExceeded(failureCount: number): boolean {
    return failureCount >= this.data.failureThreshold;
  }

  /**
   * Check if success threshold is met
   */
  isSuccessThresholdMet(successCount: number): boolean {
    return successCount >= this.data.successThreshold;
  }

  /**
   * Check if timeout is exceeded
   */
  isTimeoutExceeded(elapsedTime: number): boolean {
    return elapsedTime >= this.data.timeout;
  }

  /**
   * Check if reset timeout is exceeded
   */
  isResetTimeoutExceeded(elapsedTime: number): boolean {
    return elapsedTime >= this.data.resetTimeout;
  }

  /**
   * Check if minimum requests threshold is met
   */
  isMinimumRequestsMet(requestCount: number): boolean {
    return requestCount >= this.data.minimumRequests;
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<CircuitThresholdData>): CircuitThreshold {
    return new CircuitThreshold({ ...this.data, ...updates });
  }

  /**
   * Create default threshold
   */
  static createDefault(): CircuitThreshold {
    return new CircuitThreshold({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      resetTimeout: 30000,
      slidingWindowSize: 100,
      minimumRequests: 10,
    });
  }

  /**
   * Create strict threshold (higher thresholds)
   */
  static createStrict(): CircuitThreshold {
    return new CircuitThreshold({
      failureThreshold: 3,
      successThreshold: 3,
      timeout: 30000,
      resetTimeout: 60000,
      slidingWindowSize: 50,
      minimumRequests: 5,
    });
  }

  /**
   * Create lenient threshold (lower thresholds)
   */
  static createLenient(): CircuitThreshold {
    return new CircuitThreshold({
      failureThreshold: 10,
      successThreshold: 1,
      timeout: 120000,
      resetTimeout: 15000,
      slidingWindowSize: 200,
      minimumRequests: 20,
    });
  }

  private _validateThreshold(data: CircuitThresholdData): void {
    if (data.failureThreshold <= 0) {
      throw new Error('Failure threshold must be positive');
    }

    if (data.successThreshold <= 0) {
      throw new Error('Success threshold must be positive');
    }

    if (data.timeout <= 0) {
      throw new Error('Timeout must be positive');
    }

    if (data.resetTimeout <= 0) {
      throw new Error('Reset timeout must be positive');
    }

    if (data.slidingWindowSize <= 0) {
      throw new Error('Sliding window size must be positive');
    }

    if (data.minimumRequests < 0) {
      throw new Error('Minimum requests must be non-negative');
    }
  }
}
