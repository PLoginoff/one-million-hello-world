/**
 * Rate Limiter
 * 
 * Rate limiter for resilience.
 */

export enum RateLimitStrategy {
  TOKEN_BUCKET = 'token_bucket',
  FIXED_WINDOW = 'fixed_window',
  SLIDING_WINDOW = 'sliding_window',
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  strategy: RateLimitStrategy;
}

export class RateLimiter {
  private _config: RateLimitConfig;
  private _requests: number[];
  private _tokens: number;
  private _lastRefillTime: Date;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this._config = {
      maxRequests: config.maxRequests ?? 100,
      windowMs: config.windowMs ?? 60000,
      strategy: config.strategy ?? RateLimitStrategy.TOKEN_BUCKET,
    };
    this._requests = [];
    this._tokens = this._config.maxRequests;
    this._lastRefillTime = new Date();
  }

  /**
   * Checks if a request is allowed
   */
  async allow(): Promise<boolean> {
    this._cleanup();

    switch (this._config.strategy) {
      case RateLimitStrategy.TOKEN_BUCKET:
        return this._allowTokenBucket();
      case RateLimitStrategy.FIXED_WINDOW:
        return this._allowFixedWindow();
      case RateLimitStrategy.SLIDING_WINDOW:
        return this._allowSlidingWindow();
      default:
        return true;
    }
  }

  /**
   * Checks if a request is allowed (synchronous)
   */
  allowSync(): boolean {
    this._cleanup();

    switch (this._config.strategy) {
      case RateLimitStrategy.TOKEN_BUCKET:
        return this._allowTokenBucket();
      case RateLimitStrategy.FIXED_WINDOW:
        return this._allowFixedWindow();
      case RateLimitStrategy.SLIDING_WINDOW:
        return this._allowSlidingWindow();
      default:
        return true;
    }
  }

  /**
   * Token bucket strategy
   */
  private _allowTokenBucket(): boolean {
    this._refillTokens();

    if (this._tokens >= 1) {
      this._tokens--;
      return true;
    }

    return false;
  }

  /**
   * Fixed window strategy
   */
  private _allowFixedWindow(): boolean {
    const now = Date.now();
    const windowStart = now - this._config.windowMs;

    this._requests = this._requests.filter(time => time > windowStart);

    if (this._requests.length < this._config.maxRequests) {
      this._requests.push(now);
      return true;
    }

    return false;
  }

  /**
   * Sliding window strategy
   */
  private _allowSlidingWindow(): boolean {
    const now = Date.now();
    const windowStart = now - this._config.windowMs;

    this._requests = this._requests.filter(time => time > windowStart);

    if (this._requests.length < this._config.maxRequests) {
      this._requests.push(now);
      return true;
    }

    return false;
  }

  /**
   * Refills tokens for token bucket strategy
   */
  private _refillTokens(): void {
    const now = new Date();
    const elapsed = now.getTime() - this._lastRefillTime.getTime();

    if (elapsed >= this._config.windowMs) {
      this._tokens = this._config.maxRequests;
      this._lastRefillTime = now;
    }
  }

  /**
   * Cleans up old request timestamps
   */
  private _cleanup(): void {
    const now = Date.now();
    const windowStart = now - this._config.windowMs;
    this._requests = this._requests.filter(time => time > windowStart);
  }

  /**
   * Gets the number of remaining requests
   */
  getRemainingRequests(): number {
    this._cleanup();

    switch (this._config.strategy) {
      case RateLimitStrategy.TOKEN_BUCKET:
        this._refillTokens();
        return Math.floor(this._tokens);
      case RateLimitStrategy.FIXED_WINDOW:
      case RateLimitStrategy.SLIDING_WINDOW:
        return this._config.maxRequests - this._requests.length;
      default:
        return this._config.maxRequests;
    }
  }

  /**
   * Gets the number of used requests
   */
  getUsedRequests(): number {
    this._cleanup();

    switch (this._config.strategy) {
      case RateLimitStrategy.TOKEN_BUCKET:
        this._refillTokens();
        return this._config.maxRequests - Math.floor(this._tokens);
      case RateLimitStrategy.FIXED_WINDOW:
      case RateLimitStrategy.SLIDING_WINDOW:
        return this._requests.length;
      default:
        return 0;
    }
  }

  /**
   * Resets the rate limiter
   */
  reset(): void {
    this._requests = [];
    this._tokens = this._config.maxRequests;
    this._lastRefillTime = new Date();
  }

  /**
   * Gets the configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this._config };
  }

  /**
   * Updates the configuration
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this._config = { ...this._config, ...config };
    this.reset();
  }
}
