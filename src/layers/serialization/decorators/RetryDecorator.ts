/**
 * Retry Decorator
 * 
 * Decorator that adds retry functionality to serialization strategies.
 */

import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: (error: Error) => boolean;
}

export class RetryDecorator implements ISerializationStrategy {
  private _strategy: ISerializationStrategy;
  private _policy: RetryPolicy;
  private _enabled: boolean;

  constructor(strategy: ISerializationStrategy, policy?: Partial<RetryPolicy>) {
    this._strategy = strategy;
    this._enabled = true;
    this._policy = {
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      retryableErrors: (error: Error) => {
        const retryablePatterns = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'timeout'];
        return retryablePatterns.some(pattern => error.message.includes(pattern));
      },
      ...policy,
    };
  }

  serialize(data: unknown): string {
    if (!this._enabled) {
      return this._strategy.serialize(data);
    }

    return this._executeWithRetry(() => this._strategy.serialize(data));
  }

  deserialize(data: string): unknown {
    if (!this._enabled) {
      return this._strategy.deserialize(data);
    }

    return this._executeWithRetry(() => this._strategy.deserialize(data));
  }

  getContentType(): ContentType {
    return this._strategy.getContentType();
  }

  getFormatName(): string {
    return this._strategy.getFormatName();
  }

  canSerialize(data: unknown): boolean {
    return this._strategy.canSerialize(data);
  }

  canDeserialize(data: string): boolean {
    return this._strategy.canDeserialize(data);
  }

  /**
   * Enables or disables retry logic
   * 
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if retry logic is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Gets the retry policy
   * 
   * @returns Current retry policy
   */
  getPolicy(): RetryPolicy {
    return { ...this._policy };
  }

  /**
   * Sets the retry policy
   * 
   * @param policy - New retry policy
   */
  setPolicy(policy: Partial<RetryPolicy>): void {
    this._policy = { ...this._policy, ...policy };
  }

  /**
   * Gets the underlying strategy
   * 
   * @returns Wrapped strategy
   */
  getStrategy(): ISerializationStrategy {
    return this._strategy;
  }

  /**
   * Executes a function with retry logic
   * 
   * @param fn - Function to execute
   * @returns Function result
   */
  private _executeWithRetry<T>(fn: () => T): T {
    let lastError: Error | undefined;
    let delay = this._policy.initialDelay;

    for (let attempt = 1; attempt <= this._policy.maxAttempts; attempt++) {
      try {
        return fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this._policy.maxAttempts) {
          break;
        }

        if (!this._isRetryable(lastError)) {
          throw lastError;
        }

        this._sleep(delay);
        delay = Math.min(delay * this._policy.backoffMultiplier, this._policy.maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Checks if an error is retryable
   * 
   * @param error - Error to check
   * @returns True if retryable
   */
  private _isRetryable(error: Error): boolean {
    if (this._policy.retryableErrors) {
      return this._policy.retryableErrors(error);
    }
    return true;
  }

  /**
   * Sleeps for a specified duration
   * 
   * @param ms - Duration in milliseconds
   */
  private _sleep(ms: number): void {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // Busy wait for synchronous implementation
    }
  }
}
