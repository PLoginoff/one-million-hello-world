/**
 * MfaRateLimiter — throttle verification attempts to prevent brute force.
 *
 * Token-bucket per principal: each failed attempt consumes a token;
 * successful verification resets the bucket. Accounts lock for a
 * `lockoutMs` period after `maxAttempts` failures.
 */

export interface RateLimiterConfig {
  /** Max failed attempts before lockout (default 5). */
  maxAttempts: number;
  /** Lockout duration in ms (default 5 min). */
  lockoutMs: number;
  /** Attempts decay — after this window a failed attempt is forgotten. */
  windowMs: number;
}

interface Bucket {
  failures: number[];
  lockedUntilMs: number;
}

export class MfaRateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly config: RateLimiterConfig;
  private readonly now: () => number;

  constructor(config: Partial<RateLimiterConfig> = {}, opts: { now?: () => number } = {}) {
    this.config = {
      maxAttempts: 5,
      lockoutMs: 5 * 60 * 1000,
      windowMs: 10 * 60 * 1000,
      ...config,
    };
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Check whether an attempt is allowed for this principal.
   * Returns remaining attempts, or throws lockout info.
   */
  check(principal: string): { allowed: boolean; remaining: number; lockedUntilMs?: number } {
    const b = this.getBucket(principal);
    const now = this.now();
    if (b.lockedUntilMs > now) {
      return { allowed: false, remaining: 0, lockedUntilMs: b.lockedUntilMs };
    }
    this.decay(b, now);
    const remaining = Math.max(0, this.config.maxAttempts - b.failures.length);
    return { allowed: remaining > 0, remaining };
  }

  /**
   * Record a failed attempt. Returns true if the account is now locked.
   */
  recordFailure(principal: string): { locked: boolean; remaining: number } {
    const b = this.getBucket(principal);
    const now = this.now();
    this.decay(b, now);
    b.failures.push(now);
    if (b.failures.length >= this.config.maxAttempts) {
      b.lockedUntilMs = now + this.config.lockoutMs;
      return { locked: true, remaining: 0 };
    }
    return { locked: false, remaining: this.config.maxAttempts - b.failures.length };
  }

  /**
   * Record a success — resets the bucket.
   */
  recordSuccess(principal: string): void {
    this.buckets.delete(principal);
  }

  /** Whether a principal is currently locked. */
  isLocked(principal: string): boolean {
    const b = this.buckets.get(principal);
    if (!b) return false;
    return b.lockedUntilMs > this.now();
  }

  /** Manually unlock a principal (admin override). */
  unlock(principal: string): boolean {
    const b = this.buckets.get(principal);
    if (!b) return false;
    b.failures = [];
    b.lockedUntilMs = 0;
    return true;
  }

  /* ---------------------------------------------------------------- */

  private getBucket(principal: string): Bucket {
    let b = this.buckets.get(principal);
    if (!b) {
      b = { failures: [], lockedUntilMs: 0 };
      this.buckets.set(principal, b);
    }
    return b;
  }

  private decay(b: Bucket, now: number): void {
    const cutoff = now - this.config.windowMs;
    b.failures = b.failures.filter((t) => t > cutoff);
  }
}
