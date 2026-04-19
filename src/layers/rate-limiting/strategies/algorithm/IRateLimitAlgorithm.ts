/**
 * Rate Limit Algorithm Interface
 * 
 * Defines contract for different rate limiting algorithms.
 */

import { RateLimitKey } from '../../domain/entities/RateLimitKey';

export interface IRateLimitAlgorithm {
  /**
   * Get algorithm name
   */
  getName(): string;

  /**
   * Check if request is allowed
   */
  isAllowed(key: RateLimitKey, limit: number, window: number): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  };

  /**
   * Get current status
   */
  getStatus(key: RateLimitKey): {
    remaining?: number;
    limit?: number;
    resetAt?: number;
  } | null;

  /**
   * Reset rate limit for a key
   */
  reset(key: RateLimitKey): void;

  /**
   * Reset all rate limits
   */
  resetAll(): void;

  /**
   * Clean up expired rate limits
   */
  cleanup(): number;
}
