/**
 * Token Bucket Strategy
 *
 * Rate limiting using token bucket algorithm.
 * Tokens are refilled at a fixed rate up to bucket capacity.
 */

import { IRateLimitAlgorithm } from './IRateLimitAlgorithm';
import { RateLimitKey } from '../../domain/entities/RateLimitKey';

interface BucketState {
  tokens: number;
  lastRefill: number;
}

export class TokenBucketStrategy implements IRateLimitAlgorithm {
  private _buckets: Map<string, BucketState>;

  constructor() {
    this._buckets = new Map();
  }

  getName(): string {
    return 'TOKEN_BUCKET';
  }

  isAllowed(
    key: RateLimitKey,
    limit: number,
    window: number
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const keyStr = key.value;
    const now = Date.now();
    const refillRate = limit / window;

    let bucket = this._buckets.get(keyStr);
    if (bucket === undefined) {
      bucket = { tokens: limit, lastRefill: now };
      this._buckets.set(keyStr, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: now + (limit - bucket.tokens) / refillRate,
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt: now + (1 - bucket.tokens) / refillRate,
    };
  }

  getStatus(key: RateLimitKey): { remaining?: number; limit?: number; resetAt?: number } | null {
    const bucket = this._buckets.get(key.value);
    if (bucket === undefined) {
      return null;
    }
    return { remaining: Math.floor(bucket.tokens), limit: undefined, resetAt: undefined };
  }

  reset(key: RateLimitKey): void {
    this._buckets.delete(key.value);
  }

  resetAll(): void {
    this._buckets.clear();
  }

  cleanup(): number {
    let removed = 0;
    for (const [keyStr, bucket] of this._buckets) {
      if (bucket.tokens <= 0) {
        this._buckets.delete(keyStr);
        removed++;
      }
    }
    return removed;
  }

  getActiveKeyCount(): number {
    return this._buckets.size;
  }
}
