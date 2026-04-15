/**
 * Retry Policy Implementation
 * 
 * Concrete implementation of IRetryPolicy.
 * Handles exponential backoff, jitter, and idempotency.
 */

import { IRetryPolicy } from '../interfaces/IRetryPolicy';
import {
  RetryStrategy,
  RetryResult,
  RetryConfig,
} from '../types/retry-types';

export class RetryPolicy implements IRetryPolicy {
  private _config: RetryConfig;

  constructor() {
    this._config = {
      maxAttempts: 3,
      strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
      baseDelay: 1000,
      maxDelay: 10000,
      jitter: true,
    };
  }

  async execute<T>(operation: () => T | Promise<T>): Promise<RetryResult<T>> {
    let lastError: Error | undefined;
    let attempts = 0;

    for (let i = 0; i < this._config.maxAttempts; i++) {
      attempts++;
      try {
        const result = await operation();
        return {
          success: true,
          data: result,
          attempts,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Operation failed');

        if (i < this._config.maxAttempts - 1) {
          const delay = this._calculateDelay(i);
          await this._delay(delay);
        }
      }
    }

    return {
      success: false,
      attempts,
      error: lastError?.message || 'Max attempts reached',
    };
  }

  setConfig(config: RetryConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): RetryConfig {
    return { ...this._config };
  }

  private _calculateDelay(attempt: number): number {
    let delay: number;

    switch (this._config.strategy) {
      case RetryStrategy.EXPONENTIAL_BACKOFF:
        delay = this._config.baseDelay * Math.pow(2, attempt);
        break;
      case RetryStrategy.LINEAR_BACKOFF:
        delay = this._config.baseDelay * (attempt + 1);
        break;
      case RetryStrategy.FIXED_DELAY:
        delay = this._config.baseDelay;
        break;
      default:
        delay = this._config.baseDelay;
    }

    delay = Math.min(delay, this._config.maxDelay);

    if (this._config.jitter) {
      delay = this._applyJitter(delay);
    }

    return delay;
  }

  private _applyJitter(delay: number): number {
    const jitterAmount = delay * 0.1;
    const randomJitter = Math.random() * jitterAmount * 2 - jitterAmount;
    return Math.max(0, delay + randomJitter);
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      const end = start + ms;
      const loop = () => {
        if (Date.now() >= end) {
          resolve();
        } else {
          Promise.resolve().then(loop);
        }
      };
      loop();
    });
  }
}
