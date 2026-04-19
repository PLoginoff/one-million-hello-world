/**
 * Exponential Backoff Reconnection Strategy
 * 
 * Implements exponential backoff for reconnection attempts.
 */

export interface ReconnectionStrategyConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export class ExponentialBackoffStrategy {
  private config: ReconnectionStrategyConfig;
  private attemptCount: number;

  constructor(config: Partial<ReconnectionStrategyConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 5,
      initialDelay: config.initialDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      jitter: config.jitter ?? true,
    };
    this.attemptCount = 0;
  }

  /**
   * Get next delay before reconnection attempt
   */
  getNextDelay(): number {
    if (this.attemptCount >= this.config.maxRetries) {
      return -1;
    }

    const delay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, this.attemptCount),
      this.config.maxDelay,
    );

    const finalDelay = this.config.jitter ? this.addJitter(delay) : delay;
    this.attemptCount++;

    return finalDelay;
  }

  /**
   * Check if should attempt reconnection
   */
  shouldAttempt(): boolean {
    return this.attemptCount < this.config.maxRetries;
  }

  /**
   * Reset attempt counter
   */
  reset(): void {
    this.attemptCount = 0;
  }

  /**
   * Get current attempt count
   */
  getAttemptCount(): number {
    return this.attemptCount;
  }

  /**
   * Add random jitter to delay
   */
  private addJitter(delay: number): number {
    const jitterAmount = delay * 0.1;
    const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
    return Math.max(0, delay + jitter);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ReconnectionStrategyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ReconnectionStrategyConfig {
    return { ...this.config };
  }
}
