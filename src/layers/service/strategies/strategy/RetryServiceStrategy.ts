/**
 * Retry Service Strategy
 *
 * Decorates another strategy with retry logic on failure.
 * Uses exponential backoff between retry attempts.
 */

import { IServiceStrategy } from './IServiceStrategy';
import { ServiceEntity } from '../../domain/entities/ServiceEntity';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface RetryMetrics {
  totalAttempts: number;
  totalRetries: number;
  successfulAfterRetry: number;
  exhaustedRetries: number;
}

export class RetryServiceStrategy implements IServiceStrategy {
  private readonly _inner: IServiceStrategy;
  private readonly _options: RetryOptions;
  private _metrics: RetryMetrics;

  constructor(inner: IServiceStrategy, options?: Partial<RetryOptions>) {
    this._inner = inner;
    this._options = {
      maxRetries: options?.maxRetries ?? 3,
      baseDelayMs: options?.baseDelayMs ?? 100,
      maxDelayMs: options?.maxDelayMs ?? 5000,
    };
    this._metrics = {
      totalAttempts: 0,
      totalRetries: 0,
      successfulAfterRetry: 0,
      exhaustedRetries: 0,
    };
  }

  getName(): string {
    return `RETRY(${this._inner.getName()})`;
  }

  getPriority(): number {
    return this._inner.getPriority();
  }

  async execute(service: ServiceEntity, input: unknown): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this._options.maxRetries; attempt++) {
      this._metrics.totalAttempts++;

      try {
        const result = await this._inner.execute(service, input);
        if (attempt > 0) {
          this._metrics.successfulAfterRetry++;
        }
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this._options.maxRetries) {
          this._metrics.totalRetries++;
          const delay = this._computeDelay(attempt);
          await this._sleep(delay);
        }
      }
    }

    this._metrics.exhaustedRetries++;
    throw lastError!;
  }

  private _computeDelay(attempt: number): number {
    const delay = this._options.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, this._options.maxDelayMs);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getMetrics(): RetryMetrics {
    return { ...this._metrics };
  }

  resetMetrics(): void {
    this._metrics = {
      totalAttempts: 0,
      totalRetries: 0,
      successfulAfterRetry: 0,
      exhaustedRetries: 0,
    };
  }
}
