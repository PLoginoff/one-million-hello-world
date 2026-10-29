/**
 * Rate Limiting Redis Adapter Tests
 */

import { RateLimitingRedisAdapter, RedisClient, RateLimitingRedisAdapterFactory } from '../adapters/RedisAdapter';
import { RateLimitKey } from '../domain/entities/RateLimitKey';

const createMockRedisClient = (): RedisClient => {
  const store = new Map<string, { value: string; expiry?: number }>();
  const sets = new Map<string, Set<string>>();
  const hashes = new Map<string, Map<string, string>>();
  const sortedSets = new Map<string, Map<string, number>>();
  let scriptCache = new Map<string, string>();

  return {
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiry && Date.now() > entry.expiry) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key: string, value: string, mode?: string, ttlMs?: number) {
      const expiry = ttlMs ? Date.now() + ttlMs : undefined;
      store.set(key, { value, expiry });
      return 'OK';
    },
    async del(key: string) {
      const existed = store.has(key) || sets.has(key) || hashes.has(key) || sortedSets.has(key);
      store.delete(key);
      sets.delete(key);
      hashes.delete(key);
      sortedSets.delete(key);
      return existed ? 1 : 0;
    },
    async exists(key: string) {
      return store.has(key) ? 1 : 0;
    },
    async expire(key: string, seconds: number) {
      const entry = store.get(key);
      if (entry) {
        entry.expiry = Date.now() + seconds * 1000;
        return 1;
      }
      return 0;
    },
    async keys(pattern: string) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const allKeys = new Set([...store.keys(), ...sets.keys(), ...hashes.keys(), ...sortedSets.keys()]);
      return Array.from(allKeys).filter(k => regex.test(k));
    },
    async hget(key: string, field: string) {
      const hash = hashes.get(key);
      return hash?.get(field) ?? null;
    },
    async hset(key: string, field: string, value: string) {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key)!.set(field, value);
      return 1;
    },
    async hgetall(key: string) {
      const hash = hashes.get(key);
      return hash ? Object.fromEntries(hash) : {};
    },
    async hdel(key: string, ...fields: string[]) {
      const hash = hashes.get(key);
      if (!hash) return 0;
      let count = 0;
      for (const field of fields) {
        if (hash.delete(field)) count++;
      }
      return count;
    },
    async sadd(key: string, ...members: string[]) {
      if (!sets.has(key)) sets.set(key, new Set());
      const set = sets.get(key)!;
      let count = 0;
      for (const member of members) {
        if (!set.has(member)) {
          set.add(member);
          count++;
        }
      }
      return count;
    },
    async smembers(key: string) {
      const set = sets.get(key);
      return set ? Array.from(set) : [];
    },
    async srem(key: string, ...members: string[]) {
      const set = sets.get(key);
      if (!set) return 0;
      let count = 0;
      for (const member of members) {
        if (set.delete(member)) count++;
      }
      return count;
    },
    async sismember(key: string, member: string) {
      const set = sets.get(key);
      return set?.has(member) ? 1 : 0;
    },
    async incr(key: string) {
      const entry = store.get(key);
      const current = entry ? parseInt(entry.value, 10) : 0;
      const next = current + 1;
      store.set(key, { value: next.toString(), expiry: entry?.expiry });
      return next;
    },
    async decr(key: string) {
      const entry = store.get(key);
      const current = entry ? parseInt(entry.value, 10) : 0;
      const next = current - 1;
      store.set(key, { value: next.toString(), expiry: entry?.expiry });
      return next;
    },
    async pexpire(key: string, milliseconds: number) {
      const entry = store.get(key);
      if (entry) {
        entry.expiry = Date.now() + milliseconds;
        return 1;
      }
      return 0;
    },
    async pttl(key: string) {
      const entry = store.get(key);
      if (!entry || !entry.expiry) return -1;
      const remaining = entry.expiry - Date.now();
      return remaining > 0 ? remaining : -2;
    },
    async eval(script: string, numKeys: number, ...keys: string[]) {
      if (script.includes('fixedWindow')) {
        const key = keys[0];
        const limit = parseInt(keys[1] as string, 10);
        const window = parseInt(keys[2] as string, 10);
        const entry = store.get(key);
        if (!entry) {
          store.set(key, { value: '1', expiry: Date.now() + window });
          return [1, limit - 1, window];
        }
        const current = parseInt(entry.value, 10);
        const next = current + 1;
        store.set(key, { value: next.toString(), expiry: entry.expiry || Date.now() + window });
        if (current >= limit) {
          return [next, 0, entry.expiry ? entry.expiry - Date.now() : window];
        }
        return [next, limit - next, entry.expiry ? entry.expiry - Date.now() : window];
      }
      if (script.includes('slidingWindowLog')) {
        const key = keys[0];
        const limit = parseInt(keys[1] as string, 10);
        const window = parseInt(keys[2] as string, 10);
        const now = parseInt(keys[3] as string, 10);
        const windowStart = now - window;
        
        const sortedSet = sortedSets.get(key);
        if (sortedSet) {
          for (const [member, score] of sortedSet.entries()) {
            if (score < windowStart) {
              sortedSet.delete(member);
            }
          }
        }
        
        const count = sortedSet?.size ?? 0;
        if (count < limit) {
          const member = `${now}:${Math.random()}`;
          if (!sortedSets.has(key)) sortedSets.set(key, new Map());
          sortedSets.get(key)!.set(member, now);
          return [1, count + 1, limit - count - 1, window];
        } else {
          return [0, count, 0, window];
        }
      }
      if (script.includes('slidingWindow')) {
        const key = keys[0];
        const limit = parseInt(keys[1] as string, 10);
        const window = parseInt(keys[2] as string, 10);
        const now = parseInt(keys[3] as string, 10);
        const windowStart = now - window;
        
        // Remove expired entries from sorted set
        const sortedSet = sortedSets.get(key);
        if (sortedSet) {
          for (const [member, score] of sortedSet.entries()) {
            if (score < windowStart) {
              sortedSet.delete(member);
            }
          }
        }
        
        const current = sortedSet?.size ?? 0;
        if (current >= limit) {
          return [current + 1, 0, window];
        }
        
        const member = `${now}:${Math.random()}`;
        if (!sortedSets.has(key)) sortedSets.set(key, new Map());
        sortedSets.get(key)!.set(member, now);
        
        return [current + 1, limit - current - 1, window];
      }
      if (script.includes('tokenBucket')) {
        const key = keys[0];
        const capacity = parseInt(keys[1] as string, 10);
        const refillRate = parseFloat(keys[2] as string);
        const now = parseInt(keys[3] as string, 10);
        const tokensRequested = parseInt(keys[4] as string, 10);
        
        let hash = hashes.get(key);
        if (!hash) {
          hash = new Map();
          hashes.set(key, hash);
        }
        
        let tokens = parseFloat(hash.get('tokens') || capacity.toString());
        let lastRefill = parseInt(hash.get('lastRefill') || now.toString(), 10);
        
        const elapsed = now - lastRefill;
        const newTokens = Math.min(capacity, tokens + elapsed * refillRate);
        
        if (newTokens >= tokensRequested) {
          hash.set('tokens', (newTokens - tokensRequested).toString());
          hash.set('lastRefill', now.toString());
          return [1, newTokens - tokensRequested, 0];
        } else {
          const waitTime = (tokensRequested - newTokens) / refillRate;
          hash.set('tokens', newTokens.toString());
          hash.set('lastRefill', now.toString());
          return [0, newTokens, waitTime];
        }
      }
      return null;
    },
    async evalsha(sha: string, numKeys: number, ...keys: string[]) {
      const script = scriptCache.get(sha);
      if (!script) return null;
      return this.eval(script, numKeys, ...keys);
    },
    async scriptLoad(script: string) {
      const sha = 'sha-' + Math.random().toString(36).substring(7);
      scriptCache.set(sha, script);
      return sha;
    },
    async ping() {
      return 'PONG';
    },
    async quit() {
      return 'OK';
    },
    async zadd(key: string, score: number, member: string) {
      if (!sortedSets.has(key)) sortedSets.set(key, new Map());
      sortedSets.get(key)!.set(member, score);
      return 1;
    },
    async zrem(key: string, ...members: string[]) {
      const set = sortedSets.get(key);
      if (!set) return 0;
      let count = 0;
      for (const member of members) {
        if (set.delete(member)) count++;
      }
      return count;
    },
    async zrange(key: string, start: number, stop: number) {
      const set = sortedSets.get(key);
      if (!set) return [];
      const entries = Array.from(set.entries()).sort((a, b) => a[1] - b[1]);
      const end = stop === -1 ? entries.length : stop + 1;
      return entries.slice(start, end).map(([member]) => member);
    },
    async zremrangebyscore(key: string, min: number, max: number) {
      const set = sortedSets.get(key);
      if (!set) return 0;
      let count = 0;
      for (const [member, score] of set.entries()) {
        if (score >= min && score <= max) {
          set.delete(member);
          count++;
        }
      }
      return count;
    },
    async zcard(key: string) {
      const set = sortedSets.get(key);
      return set?.size ?? 0;
    },
  };
};

describe('RateLimitingRedisAdapter', () => {
  let mockClient: RedisClient;
  let adapter: RateLimitingRedisAdapter;

  beforeEach(() => {
    mockClient = createMockRedisClient();
    adapter = RateLimitingRedisAdapterFactory.create(mockClient);
  });

  describe('Fixed Window', () => {
    it('should check fixed window rate limit', async () => {
      const key = RateLimitKey.fromIp('192.168.1.1');
      const result = await adapter.checkFixedWindow(key, 10, 60000);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.remaining).toBe(9);
    });

    it('should enforce fixed window limit', async () => {
      const key = RateLimitKey.fromIp('192.168.1.2');
      
      for (let i = 0; i < 10; i++) {
        const result = await adapter.checkFixedWindow(key, 10, 60000);
        expect(result.allowed).toBe(true);
      }

      const result = await adapter.checkFixedWindow(key, 10, 60000);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(11);
    });
  });

  describe('Sliding Window', () => {
    it('should check sliding window rate limit', async () => {
      const key = RateLimitKey.fromIp('192.168.1.3');
      const result = await adapter.checkSlidingWindow(key, 10, 60000);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.remaining).toBe(9);
    });

    it('should enforce sliding window limit', async () => {
      const key = RateLimitKey.fromIp('192.168.1.4');
      
      for (let i = 0; i < 10; i++) {
        const result = await adapter.checkSlidingWindow(key, 10, 60000);
        expect(result.allowed).toBe(true);
      }

      const result = await adapter.checkSlidingWindow(key, 10, 60000);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Sliding Window Log', () => {
    it('should check sliding window log rate limit', async () => {
      const key = RateLimitKey.fromIp('192.168.1.5');
      const result = await adapter.checkSlidingWindowLog(key, 10, 60000);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.remaining).toBe(9);
    });
  });

  describe('Token Bucket', () => {
    it('should check token bucket rate limit', async () => {
      const key = RateLimitKey.fromIp('192.168.1.6');
      const result = await adapter.checkTokenBucket(key, 10, 0.1, 1); // 0.1 tokens/ms = 100 tokens/sec

      expect(result.allowed).toBe(true);
      expect(result.tokensRemaining).toBeLessThanOrEqual(10);
    });

    it('should deny when tokens exhausted', async () => {
      const key = RateLimitKey.fromIp('192.168.1.7');
      
      // Use all tokens
      for (let i = 0; i < 10; i++) {
        const result = await adapter.checkTokenBucket(key, 10, 0.001, 1); // Very slow refill
        expect(result.allowed).toBe(true);
      }

      const result = await adapter.checkTokenBucket(key, 10, 0.001, 1);
      expect(result.allowed).toBe(false);
      expect(result.waitTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Generic checkRateLimit', () => {
    it('should use sliding window log by default', async () => {
      const key = RateLimitKey.fromIp('192.168.1.8');
      const result = await adapter.checkRateLimit(key, 5, 60000);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
    });
  });

  describe('Reset', () => {
    it('should reset rate limit for key', async () => {
      const key = RateLimitKey.fromIp('192.168.1.9');
      
      await adapter.checkRateLimit(key, 5, 60000);
      await adapter.checkRateLimit(key, 5, 60000);
      
      await adapter.resetRateLimit(key);
      
      const result = await adapter.checkRateLimit(key, 5, 60000);
      expect(result.current).toBe(1);
    });
  });

  describe('Get Usage', () => {
    it('should get current usage', async () => {
      const key = RateLimitKey.fromIp('192.168.1.10');
      
      await adapter.checkRateLimit(key, 10, 60000);
      await adapter.checkRateLimit(key, 10, 60000);
      
      const usage = await adapter.getUsage(key, 60000);
      expect(usage.current).toBe(2);
    });
  });

  describe('Active Keys', () => {
    it('should get active keys', async () => {
      const key1 = RateLimitKey.fromIp('192.168.1.11');
      const key2 = RateLimitKey.fromIp('192.168.1.12');
      
      await adapter.checkRateLimit(key1, 10, 60000);
      await adapter.checkRateLimit(key2, 10, 60000);
      
      const keys = await adapter.getActiveKeys();
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });

    it('should get key count', async () => {
      const count = await adapter.getKeyCount();
      expect(typeof count).toBe('number');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.details.status).toBe('connected');
    });
  });

  describe('Configuration', () => {
    it('should return config', () => {
      const config = adapter.getConfig();
      expect(config.keyPrefix).toBe('ratelimit:');
      expect(config.defaultTtlMs).toBe(3600000);
    });

    it('should update config', () => {
      adapter.updateConfig({ keyPrefix: 'custom:' });
      const config = adapter.getConfig();
      expect(config.keyPrefix).toBe('custom:');
    });
  });
});

describe('RateLimitingRedisAdapterFactory', () => {
  let mockClient: RedisClient;

  beforeEach(() => {
    mockClient = createMockRedisClient();
  });

  it('should create adapter with options', () => {
    const adapter = RateLimitingRedisAdapterFactory.create(mockClient, { keyPrefix: 'test:' });
    expect(adapter).toBeInstanceOf(RateLimitingRedisAdapter);
    expect(adapter.getConfig().keyPrefix).toBe('test:');
  });

  it('should create adapter with defaults', () => {
    const adapter = RateLimitingRedisAdapterFactory.createWithDefaults(mockClient);
    expect(adapter).toBeInstanceOf(RateLimitingRedisAdapter);
    expect(adapter.getConfig().keyPrefix).toBe('ratelimit:');
  });
});