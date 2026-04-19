/**
 * Rate Limiting Service
 * 
 * Provides rate limiting logic and enforcement.
 */

import { RateLimitEntity } from '../entities/RateLimitEntity';
import { RateLimitKey } from '../entities/RateLimitKey';

export class RateLimitingService {
  private limits: Map<string, RateLimitEntity>;

  constructor() {
    this.limits = new Map();
  }

  /**
   * Check if request is allowed
   */
  isAllowed(key: RateLimitKey, limit: number, window: number): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const keyStr = key.toString();
    let rateLimit = this.limits.get(keyStr);

    if (!rateLimit || rateLimit.isExpired()) {
      rateLimit = RateLimitEntity.createNew(keyStr, limit, window);
      this.limits.set(keyStr, rateLimit);
    }

    if (rateLimit.isExceeded()) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: rateLimit.data.resetAt,
      };
    }

    rateLimit = rateLimit.decrement();
    this.limits.set(keyStr, rateLimit);

    return {
      allowed: true,
      remaining: rateLimit.data.remaining,
      resetAt: rateLimit.data.resetAt,
    };
  }

  /**
   * Get current rate limit status
   */
  getStatus(key: RateLimitKey): {
    remaining?: number;
    limit?: number;
    resetAt?: number;
  } | null {
    const rateLimit = this.limits.get(key.toString());
    if (!rateLimit) return null;

    if (rateLimit.isExpired()) {
      this.limits.delete(key.toString());
      return null;
    }

    return {
      remaining: rateLimit.data.remaining,
      limit: rateLimit.data.limit,
      resetAt: rateLimit.data.resetAt,
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: RateLimitKey): void {
    this.limits.delete(key.toString());
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.limits.clear();
  }

  /**
   * Clean up expired rate limits
   */
  cleanup(): number {
    let cleaned = 0;
    for (const [key, rateLimit] of this.limits.entries()) {
      if (rateLimit.isExpired()) {
        this.limits.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * Get all active rate limits
   */
  getAllActive(): RateLimitEntity[] {
    const active: RateLimitEntity[] = [];
    for (const rateLimit of this.limits.values()) {
      if (!rateLimit.isExpired()) {
        active.push(rateLimit);
      }
    }
    return active;
  }

  /**
   * Get total count of rate limits
   */
  getCount(): number {
    return this.limits.size;
  }
}
