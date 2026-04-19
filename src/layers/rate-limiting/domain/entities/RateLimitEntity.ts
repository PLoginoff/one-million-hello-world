/**
 * Rate Limit Entity
 * 
 * Represents a rate limit rule with metadata.
 */

export interface RateLimitData {
  identifier: string;
  limit: number;
  window: number;
  remaining: number;
  resetAt: number;
  createdAt: number;
  updatedAt: number;
}

export class RateLimitEntity {
  readonly data: RateLimitData;

  private constructor(data: RateLimitData) {
    this.data = { ...data };
  }

  /**
   * Create rate limit entity
   */
  static create(data: RateLimitData): RateLimitEntity {
    return new RateLimitEntity(data);
  }

  /**
   * Create new rate limit
   */
  static createNew(
    identifier: string,
    limit: number,
    window: number
  ): RateLimitEntity {
    const now = Date.now();
    return new RateLimitEntity({
      identifier,
      limit,
      window,
      remaining: limit,
      resetAt: now + window,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Decrement remaining count
   */
  decrement(): RateLimitEntity {
    if (this.data.remaining <= 0) {
      return this;
    }
    return new RateLimitEntity({
      ...this.data,
      remaining: this.data.remaining - 1,
      updatedAt: Date.now(),
    });
  }

  /**
   * Check if limit is exceeded
   */
  isExceeded(): boolean {
    return this.data.remaining <= 0;
  }

  /**
   * Check if limit is near threshold
   */
  isNearThreshold(threshold: number): boolean {
    return this.data.remaining <= threshold;
  }

  /**
   * Get usage percentage
   */
  getUsagePercentage(): number {
    return ((this.data.limit - this.data.remaining) / this.data.limit) * 100;
  }

  /**
   * Check if window has expired
   */
  isExpired(): boolean {
    return Date.now() >= this.data.resetAt;
  }

  /**
   * Reset the rate limit
   */
  reset(): RateLimitEntity {
    const now = Date.now();
    return new RateLimitEntity({
      ...this.data,
      remaining: this.data.limit,
      resetAt: now + this.data.window,
      updatedAt: now,
    });
  }

  /**
   * Get time until reset
   */
  getTimeUntilReset(): number {
    return Math.max(0, this.data.resetAt - Date.now());
  }

  /**
   * Get remaining time in window
   */
  getRemainingWindowTime(): number {
    return Math.max(0, this.data.resetAt - Date.now());
  }

  /**
   * Clone the entity
   */
  clone(): RateLimitEntity {
    return new RateLimitEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): RateLimitData {
    return { ...this.data };
  }

  /**
   * Check if two rate limits are equal
   */
  equals(other: RateLimitEntity): boolean {
    return this.data.identifier === other.data.identifier;
  }
}
