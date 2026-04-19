/**
 * Retry Policy
 * 
 * Retry policy for resilience.
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: (error: Error) => boolean;
}

export class RetryPolicy {
  private _config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this._config = {
      maxAttempts: config.maxAttempts ?? 3,
      initialDelay: config.initialDelay ?? 100,
      maxDelay: config.maxDelay ?? 1000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      retryableErrors: config.retryableErrors ?? (() => true),
    };
  }

  /**
   * Executes a function with retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let delay = this._config.initialDelay;

    for (let attempt = 1; attempt <= this._config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this._config.maxAttempts) {
          break;
        }

        if (!this._config.retryableErrors!(lastError)) {
          break;
        }

        await this._sleep(delay);
        delay = Math.min(delay * this._config.backoffMultiplier, this._config.maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Executes a synchronous function with retry logic
   */
  executeSync<T>(fn: () => T): T {
    let lastError: Error | null = null;
    let delay = this._config.initialDelay;

    for (let attempt = 1; attempt <= this._config.maxAttempts; attempt++) {
      try {
        return fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this._config.maxAttempts) {
          break;
        }

        if (!this._config.retryableErrors!(lastError)) {
          break;
        }

        this._sleepSync(delay);
        delay = Math.min(delay * this._config.backoffMultiplier, this._config.maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Sleeps for specified milliseconds
   */
  private async _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Synchronous sleep (blocking)
   */
  private _sleepSync(ms: number): void {
    const start = Date.now();
    while (Date.now() - start < ms) {
    }
  }

  /**
   * Gets the configuration
   */
  getConfig(): RetryConfig {
    return { ...this._config };
  }

  /**
   * Updates the configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this._config = { ...this._config, ...config };
  }

  /**
   * Calculates delay for a given attempt
   */
  calculateDelay(attempt: number): number {
    let delay = this._config.initialDelay;
    for (let i = 1; i < attempt; i++) {
      delay = Math.min(delay * this._config.backoffMultiplier, this._config.maxDelay);
    }
    return delay;
  }
}
