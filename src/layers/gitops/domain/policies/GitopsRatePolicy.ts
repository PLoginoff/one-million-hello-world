/**
 * GitopsRatePolicy
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  key: string;
}

export interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil?: number;
}

export class GitopsRatePolicy {
  private _entries: Map<string, RateLimitEntry>;
  private _configs: Map<string, RateLimitConfig>;
  private _blockDurationMs: number;

  constructor(blockDurationMs: number = 60000) {
    this._entries = new Map();
    this._configs = new Map();
    this._blockDurationMs = blockDurationMs;
  }

  configure(key: string, config: RateLimitConfig): void {
    this._configs.set(key, config);
  }

  check(key: string, identifier: string): { allowed: boolean; remaining: number; retryAfter?: number } {
    const config = this._configs.get(key);
    if (!config) return { allowed: true, remaining: Infinity };

    const entryKey = key + ':' + identifier;
    let entry = this._entries.get(entryKey);
    const now = Date.now();

    if (entry !== undefined && entry.blocked && entry.blockedUntil !== undefined && now < entry.blockedUntil) {
      return { allowed: false, remaining: 0, retryAfter: entry.blockedUntil - now };
    }

    if (!entry || now - entry.windowStart > config.windowMs) {
      entry = { count: 0, windowStart: now, blocked: false };
      this._entries.set(entryKey, entry);
    }

    entry.count++;
    const remaining = Math.max(0, config.maxRequests - entry.count);

    if (entry.count > config.maxRequests) {
      entry.blocked = true;
      entry.blockedUntil = now + this._blockDurationMs;
      return { allowed: false, remaining: 0, retryAfter: this._blockDurationMs };
    }

    return { allowed: true, remaining: remaining };
  }

  reset(key: string, identifier: string): void {
    this._entries.delete(key + ':' + identifier);
  }

  resetAll(): void {
    this._entries.clear();
  }

  getEntry(key: string, identifier: string): RateLimitEntry | null {
    return this._entries.get(key + ':' + identifier) ?? null;
  }

  getBlockDuration(): number {
    return this._blockDurationMs;
  }
  setBlockDuration(ms: number): void {
    this._blockDurationMs = ms;
  }
}
