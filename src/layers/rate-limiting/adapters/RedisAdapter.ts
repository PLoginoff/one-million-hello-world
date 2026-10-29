/**
 * Rate Limiting Redis Adapter
 *
 * Real implementation using Redis for distributed rate limiting.
 *
 * @module RateLimitingLayer/Adapters
 */

import { RateLimitingInMemoryAdapter } from './InMemoryAdapter';
import { RateLimitingErrorFactory } from '../errors';
import { RateLimitConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { RateLimitEntity } from '../domain/entities/RateLimitEntity';
import { RateLimitKey } from '../domain/entities/RateLimitKey';
import { RateLimitWindowValueObject } from '../domain/value-objects/RateLimitWindowValueObject';

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttlMs?: number): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, ...members: string[]): Promise<number>;
  sismember(key: string, member: string): Promise<number>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
  eval(script: string, numKeys: number, ...keys: string[]): Promise<unknown>;
  evalsha(sha: string, numKeys: number, ...keys: string[]): Promise<unknown>;
  scriptLoad(script: string): Promise<string>;
  ping(): Promise<string>;
  quit(): Promise<'OK'>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  zcard(key: string): Promise<number>;
}

export interface RateLimitingRedisAdapterOptions {
  client: RedisClient;
  keyPrefix: string;
  defaultTtlMs: number;
  enableSlidingWindow: boolean;
  enableFixedWindow: boolean;
  enableTokenBucket: boolean;
  luaScriptCache: boolean;
}

const DEFAULT_OPTIONS: Partial<RateLimitingRedisAdapterOptions> = {
  keyPrefix: 'ratelimit:',
  defaultTtlMs: 3600000,
  enableSlidingWindow: true,
  enableFixedWindow: true,
  enableTokenBucket: true,
  luaScriptCache: true,
};

export class RateLimitingRedisAdapter extends RateLimitingInMemoryAdapter {
  private readonly client: RedisClient;
  private readonly options: RateLimitingRedisAdapterOptions;
  private readonly luaScripts: Map<string, string>;
  private scriptShas: Map<string, string>;

  constructor(options: RateLimitingRedisAdapterOptions) {
    super();
    this.client = options.client;
    this.options = { ...DEFAULT_OPTIONS, ...options } as RateLimitingRedisAdapterOptions;
    this.luaScripts = new Map();
    this.scriptShas = new Map();
    this.initializeScripts();
  }

  private initializeScripts(): void {
    // Fixed window rate limit
    this.luaScripts.set(
      'fixedWindow',
      `
      -- fixedWindow
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local windowStart = now - (now % window)
      local windowKey = key .. ':' .. windowStart
      local current = redis.call('GET', windowKey)
      if current == false then
        redis.call('SET', windowKey, 1, 'PX', window)
        return {1, limit - 1, window}
      end
      if tonumber(current) >= limit then
        local ttl = redis.call('PTTL', windowKey)
        return {tonumber(current), 0, ttl}
      end
      local incr = redis.call('INCR', windowKey)
      if incr == 1 then
        redis.call('PEXPIRE', windowKey, window)
      end
      local ttl = redis.call('PTTL', windowKey)
      return {incr, limit - incr, ttl}
      `
    );

    // Sliding window rate limit (using sorted set)
    this.luaScripts.set(
      'slidingWindow',
      `
      -- slidingWindow
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local windowStart = now - window
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
      local current = redis.call('ZCARD', key)
      if current >= limit then
        local ttl = redis.call('PTTL', key)
        if ttl == -1 then ttl = window end
        return {current, 0, ttl}
      end
      local member = now .. ':' .. math.random()
      redis.call('ZADD', key, now, member)
      redis.call('PEXPIRE', key, window)
      local ttl = redis.call('PTTL', key)
      return {current + 1, limit - current - 1, ttl}
      `
    );

    // Token bucket rate limit
    this.luaScripts.set(
      'tokenBucket',
      `
      -- tokenBucket
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refillRate = tonumber(ARGV[2]) -- tokens per ms
      local now = tonumber(ARGV[3])
      local tokensRequested = tonumber(ARGV[4])
      local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
      local tokens = tonumber(bucket[1])
      local lastRefill = tonumber(bucket[2])
      if tokens == nil then
        tokens = capacity
        lastRefill = now
      end
      local elapsed = now - lastRefill
      local newTokens = math.min(capacity, tokens + (elapsed * refillRate))
      if newTokens >= tokensRequested then
        newTokens = newTokens - tokensRequested
        redis.call('HMSET', key, 'tokens', newTokens, 'lastRefill', now)
        redis.call('PEXPIRE', key, math.ceil(capacity / refillRate) * 2)
        return {1, newTokens, 0}
      else
        local waitTime = (tokensRequested - newTokens) / refillRate
        redis.call('HMSET', key, 'tokens', newTokens, 'lastRefill', now)
        redis.call('PEXPIRE', key, math.ceil(capacity / refillRate) * 2)
        return {0, newTokens, waitTime}
      end
      `
    );

    // Sliding window log (for precise limiting)
    this.luaScripts.set(
      'slidingWindowLog',
      `
      -- slidingWindowLog
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local windowStart = now - window
      redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
      local count = redis.call('ZCARD', key)
      if count < limit then
        redis.call('ZADD', key, now, now .. ':' .. math.random())
        redis.call('PEXPIRE', key, window)
        return {1, count + 1, limit - count - 1, window}
      else
        local oldest = redis.call('ZRANGE', key, 0, 0)
        local resetTime = 0
        if #oldest > 0 then
          resetTime = tonumber(string.match(oldest[1], '^(%d+)')) + window
        else
          resetTime = now + window
        end
        local ttl = redis.call('PTTL', key)
        return {0, count, 0, ttl > 0 and ttl or window}
      end
      `
    );
  }

  private async getScriptSha(name: string): Promise<string> {
    if (this.options.luaScriptCache && this.scriptShas.has(name)) {
      return this.scriptShas.get(name)!;
    }
    const script = this.luaScripts.get(name);
    if (!script) {
      throw RateLimitingErrorFactory.execution(`Lua script not found: ${name}`);
    }
    const sha = await this.client.scriptLoad(script);
    if (this.options.luaScriptCache) {
      this.scriptShas.set(name, sha);
    }
    return sha;
  }

  private getKey(suffix: string): string {
    return `${this.options.keyPrefix}${suffix}`;
  }

  // Fixed Window
  async checkFixedWindow(
    key: RateLimitKey,
    limit: number,
    windowMs: number
  ): Promise<{
    allowed: boolean;
    current: number;
    remaining: number;
    resetTime: number;
  }> {
    if (!this.options.enableFixedWindow) {
      return { allowed: true, current: 0, remaining: limit, resetTime: Date.now() + windowMs };
    }

    const redisKey = this.getKey(`fixed:${key.toString()}`);
    const sha = await this.getScriptSha('fixedWindow');
    const now = Date.now();
    const result = (await this.client.evalsha(
      sha,
      1,
      redisKey,
      limit.toString(),
      windowMs.toString(),
      now.toString()
    )) as number[];

    const [current, remaining, ttl] = result;
    return {
      allowed: current <= limit,
      current,
      remaining: Math.max(0, remaining),
      resetTime: Date.now() + ttl,
    };
  }

  // Sliding Window
  async checkSlidingWindow(
    key: RateLimitKey,
    limit: number,
    windowMs: number
  ): Promise<{
    allowed: boolean;
    current: number;
    remaining: number;
    resetTime: number;
  }> {
    if (!this.options.enableSlidingWindow) {
      return { allowed: true, current: 0, remaining: limit, resetTime: Date.now() + windowMs };
    }

    const redisKey = this.getKey(`sliding:${key.toString()}`);
    const sha = await this.getScriptSha('slidingWindow');
    const now = Date.now();
    const result = (await this.client.evalsha(
      sha,
      1,
      redisKey,
      limit.toString(),
      windowMs.toString(),
      now.toString()
    )) as number[];

    const [current, remaining, ttl] = result;
    return {
      allowed: current <= limit,
      current,
      remaining: Math.max(0, remaining),
      resetTime: Date.now() + ttl,
    };
  }

  // Sliding Window Log (precise)
  async checkSlidingWindowLog(
    key: RateLimitKey,
    limit: number,
    windowMs: number
  ): Promise<{
    allowed: boolean;
    current: number;
    remaining: number;
    resetTime: number;
  }> {
    const redisKey = this.getKey(`swl:${key.toString()}`);
    const sha = await this.getScriptSha('slidingWindowLog');
    const now = Date.now();
    const result = (await this.client.evalsha(
      sha,
      1,
      redisKey,
      limit.toString(),
      windowMs.toString(),
      now.toString()
    )) as number[];

    const [allowed, current, remaining, ttl] = result;
    return {
      allowed: allowed === 1,
      current,
      remaining: Math.max(0, remaining),
      resetTime: Date.now() + ttl,
    };
  }

  // Token Bucket
  async checkTokenBucket(
    key: RateLimitKey,
    capacity: number,
    refillRatePerMs: number,
    tokensRequested: number = 1
  ): Promise<{
    allowed: boolean;
    tokensRemaining: number;
    waitTimeMs: number;
  }> {
    if (!this.options.enableTokenBucket) {
      return { allowed: true, tokensRemaining: capacity, waitTimeMs: 0 };
    }

    const redisKey = this.getKey(`tb:${key.toString()}`);
    const sha = await this.getScriptSha('tokenBucket');
    const now = Date.now();
    const result = (await this.client.evalsha(
      sha,
      1,
      redisKey,
      capacity.toString(),
      refillRatePerMs.toString(),
      now.toString(),
      tokensRequested.toString()
    )) as number[];

    const [allowed, tokensRemaining, waitTime] = result;
    return {
      allowed: allowed === 1,
      tokensRemaining,
      waitTimeMs: waitTime,
    };
  }

  // Generic check (uses sliding window log by default)
  async checkRateLimit(
    key: RateLimitKey,
    limit: number,
    windowMs: number
  ): Promise<{
    allowed: boolean;
    current: number;
    remaining: number;
    resetTime: number;
  }> {
    return this.checkSlidingWindowLog(key, limit, windowMs);
  }

  // Reset
  async resetRateLimit(key: RateLimitKey): Promise<void> {
    const patterns = [
      this.getKey(`fixed:${key.toString()}`),
      this.getKey(`sliding:${key.toString()}`),
      this.getKey(`swl:${key.toString()}`),
      this.getKey(`tb:${key.toString()}`),
    ];

    for (const pattern of patterns) {
      await this.client.del(pattern);
    }
  }

  // Get current usage
  async getUsage(
    key: RateLimitKey,
    windowMs: number
  ): Promise<{
    current: number;
    oldestEntry?: number;
  }> {
    const redisKey = this.getKey(`swl:${key.toString()}`);
    const now = Date.now();
    const windowStart = now - windowMs;

    await this.client.zremrangebyscore(redisKey, -Infinity, windowStart);
    const current = await this.client.zcard(redisKey);
    const oldest = await this.client.zrange(redisKey, 0, 0);

    return {
      current,
      oldestEntry: oldest.length > 0 ? parseInt(oldest[0].split(':')[0], 10) : undefined,
    };
  }

  // Get all active keys (for monitoring)
  async getActiveKeys(pattern?: string): Promise<string[]> {
    const searchPattern = pattern ? this.getKey(pattern) : this.getKey('*');
    return this.client.keys(searchPattern);
  }

  // Get key count
  async getKeyCount(pattern?: string): Promise<number> {
    const keys = await this.getActiveKeys(pattern);
    return keys.length;
  }

  // Health Check
  async healthCheck(): Promise<{ healthy: boolean; latency: number; details: Record<string, unknown> }> {
    const start = Date.now();
    try {
      await this.client.ping();
      return {
        healthy: true,
        latency: Date.now() - start,
        details: { status: 'connected' },
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        details: { status: 'disconnected', error: (error as Error).message },
      };
    }
  }

  // Cleanup
  async cleanup(): Promise<void> {
    await this.client.quit();
  }

  // Configuration
  getConfig(): RateLimitingRedisAdapterOptions {
    return { ...this.options };
  }

  updateConfig(updates: Partial<RateLimitingRedisAdapterOptions>): void {
    Object.assign(this.options, updates);
    if (updates.luaScriptCache === false) {
      this.scriptShas.clear();
    }
  }
}

export class RateLimitingRedisAdapterFactory {
  static create(client: RedisClient, options?: Partial<RateLimitingRedisAdapterOptions>): RateLimitingRedisAdapter {
    return new RateLimitingRedisAdapter({ client, ...options } as RateLimitingRedisAdapterOptions);
  }

  static createWithDefaults(client: RedisClient): RateLimitingRedisAdapter {
    return new RateLimitingRedisAdapter({ client } as RateLimitingRedisAdapterOptions);
  }
}
