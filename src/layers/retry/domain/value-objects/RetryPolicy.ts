/**
 * Retry Policy Value Object
 *
 * Represents retry policy configuration.
 * Immutable value object for retry management.
 */

export interface RetryPolicyData {
  maxAttempts: number;
  backoffStrategy: BackoffStrategy;
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitterEnabled: boolean;
  jitterFactor: number;
}

export type BackoffStrategy = 'fixed' | 'exponential' | 'linear' | 'custom';

export class RetryPolicy {
  readonly data: RetryPolicyData;

  constructor(data: RetryPolicyData) {
    this._validatePolicy(data);
    this.data = { ...data };
  }

  /**
   * Get max attempts
   */
  getMaxAttempts(): number {
    return this.data.maxAttempts;
  }

  /**
   * Get backoff strategy
   */
  getBackoffStrategy(): BackoffStrategy {
    return this.data.backoffStrategy;
  }

  /**
   * Get initial delay
   */
  getInitialDelay(): number {
    return this.data.initialDelay;
  }

  /**
   * Get max delay
   */
  getMaxDelay(): number {
    return this.data.maxDelay;
  }

  /**
   * Get multiplier
   */
  getMultiplier(): number {
    return this.data.multiplier;
  }

  /**
   * Check if jitter is enabled
   */
  isJitterEnabled(): boolean {
    return this.data.jitterEnabled;
  }

  /**
   * Get jitter factor
   */
  getJitterFactor(): number {
    return this.data.jitterFactor;
  }

  /**
   * Calculate delay for attempt
   */
  calculateDelay(attemptNumber: number): number {
    let delay: number;

    switch (this.data.backoffStrategy) {
      case 'fixed':
        delay = this.data.initialDelay;
        break;
      case 'exponential':
        delay = this.data.initialDelay * Math.pow(this.data.multiplier, attemptNumber - 1);
        break;
      case 'linear':
        delay = this.data.initialDelay + (this.data.initialDelay * (attemptNumber - 1));
        break;
      default:
        delay = this.data.initialDelay;
    }

    delay = Math.min(delay, this.data.maxDelay);

    if (this.data.jitterEnabled) {
      const jitter = delay * this.data.jitterFactor;
      delay = delay + (Math.random() * jitter * 2 - jitter);
    }

    return Math.max(0, delay);
  }

  /**
   * Check if should retry
   */
  shouldRetry(attemptNumber: number): boolean {
    return attemptNumber <= this.data.maxAttempts;
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<RetryPolicyData>): RetryPolicy {
    return new RetryPolicy({ ...this.data, ...updates });
  }

  /**
   * Create default policy
   */
  static createDefault(): RetryPolicy {
    return new RetryPolicy({
      maxAttempts: 3,
      backoffStrategy: 'exponential',
      initialDelay: 1000,
      maxDelay: 10000,
      multiplier: 2,
      jitterEnabled: true,
      jitterFactor: 0.1,
    });
  }

  /**
   * Create immediate retry policy
   */
  static createImmediate(): RetryPolicy {
    return new RetryPolicy({
      maxAttempts: 3,
      backoffStrategy: 'fixed',
      initialDelay: 0,
      maxDelay: 0,
      multiplier: 1,
      jitterEnabled: false,
      jitterFactor: 0,
    });
  }

  /**
   * Create aggressive retry policy
   */
  static createAggressive(): RetryPolicy {
    return new RetryPolicy({
      maxAttempts: 10,
      backoffStrategy: 'exponential',
      initialDelay: 100,
      maxDelay: 5000,
      multiplier: 1.5,
      jitterEnabled: true,
      jitterFactor: 0.2,
    });
  }

  private _validatePolicy(data: RetryPolicyData): void {
    if (data.maxAttempts < 1) {
      throw new Error('Max attempts must be at least 1');
    }

    if (data.initialDelay < 0) {
      throw new Error('Initial delay must be non-negative');
    }

    if (data.maxDelay < data.initialDelay) {
      throw new Error('Max delay must be greater than or equal to initial delay');
    }

    if (data.multiplier < 1) {
      throw new Error('Multiplier must be at least 1');
    }

    if (data.jitterFactor < 0 || data.jitterFactor > 1) {
      throw new Error('Jitter factor must be between 0 and 1');
    }
  }
}
