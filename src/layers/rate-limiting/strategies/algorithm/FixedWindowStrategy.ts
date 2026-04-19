/**
 * Fixed Window Rate Limiting Strategy
 * 
 * Implements fixed window algorithm for rate limiting.
 */

import { IRateLimitAlgorithm } from './IRateLimitAlgorithm';
import { RateLimitKey } from '../../domain/entities/RateLimitKey';

interface WindowData {
  count: number;
  windowStart: number;
  windowEnd: number;
}

export class FixedWindowStrategy implements IRateLimitAlgorithm {
  private windows: Map<string, WindowData>;

  constructor() {
    this.windows = new Map();
  }

  getName(): string {
    return 'FIXED_WINDOW';
  }

  isAllowed(key: RateLimitKey, limit: number, window: number): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const keyStr = key.toString();
    const now = Date.now();
    let windowData = this.windows.get(keyStr);

    if (!windowData || now >= windowData.windowEnd) {
      windowData = {
        count: 1,
        windowStart: now,
        windowEnd: now + window,
      };
      this.windows.set(keyStr, windowData);
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: windowData.windowEnd,
      };
    }

    if (windowData.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowData.windowEnd,
      };
    }

    windowData.count++;
    this.windows.set(keyStr, windowData);

    return {
      allowed: true,
      remaining: limit - windowData.count,
      resetAt: windowData.windowEnd,
    };
  }

  getStatus(key: RateLimitKey): {
    remaining?: number;
    limit?: number;
    resetAt?: number;
  } | null {
    const windowData = this.windows.get(key.toString());
    if (!windowData) return null;

    const now = Date.now();
    if (now >= windowData.windowEnd) {
      this.windows.delete(key.toString());
      return null;
    }

    return {
      remaining: windowData.count,
      resetAt: windowData.windowEnd,
    };
  }

  reset(key: RateLimitKey): void {
    this.windows.delete(key.toString());
  }

  resetAll(): void {
    this.windows.clear();
  }

  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();
    for (const [key, windowData] of this.windows.entries()) {
      if (now >= windowData.windowEnd) {
        this.windows.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}
