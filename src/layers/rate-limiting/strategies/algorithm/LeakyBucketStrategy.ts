/**
 * Leaky Bucket Strategy
 *
 * Rate limiting using leaky bucket algorithm.
 * Requests are added to a bucket that leaks at a fixed rate.
 */

import { IRateLimitAlgorithm } from './IRateLimitAlgorithm';
import { RateLimitKey } from '../../domain/entities/RateLimitKey';

interface LeakyBucketState {
  water: number;
  lastLeak: number;
}

export class LeakyBucketStrategy implements IRateLimitAlgorithm {
  private _buckets: Map<string, LeakyBucketState>;

  constructor() {
    this._buckets = new Map();
  }

  getName(): string {
    return 'LEAKY_BUCKET';
  }

  isAllowed(
    key: RateLimitKey,
    limit: number,
    window: number
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const keyStr = key.value;
    const now = Date.now();
    const leakRate = limit / window;

    let bucket = this._buckets.get(keyStr);
    if (bucket === undefined) {
      bucket = { water: 0, lastLeak: now };
      this._buckets.set(keyStr, bucket);
    }

    const elapsed = now - bucket.lastLeak;
    bucket.water = Math.max(0, bucket.water - elapsed * leakRate);
    bucket.lastLeak = now;

    if (bucket.water + 1 <= limit) {
      bucket.water += 1;
      return {
        allowed: true,
        remaining: Math.floor(limit - bucket.water),
        resetAt: now + bucket.water / leakRate,
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt: now + (bucket.water - limit + 1) / leakRate,
    };
  }

  getStatus(key: RateLimitKey): { remaining?: number; limit?: number; resetAt?: number } | null {
    const bucket = this._buckets.get(key.value);
    if (bucket === undefined) {
      return null;
    }
    return { remaining: Math.floor(Math.max(0, 100 - bucket.water)), limit: undefined, resetAt: undefined };
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
      if (bucket.water <= 0) {
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
