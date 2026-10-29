/**
 * Security Redis Adapter Tests
 */

import { SecurityRedisAdapter, RedisClient, SecurityRedisAdapterFactory } from '../adapters/RedisAdapter';
import { SecurityContextEntity } from '../domain/entities/SecurityContextEntity';
import { ThreatEntity } from '../domain/entities/ThreatEntity';
import { PolicyEntity } from '../domain/entities/PolicyEntity';
import { SecurityLevel, ThreatType, ThreatSeverity } from '../types/security-types';

// Mock Redis client
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
      return Array.from(store.keys()).filter(k => regex.test(k));
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
      // Simplified eval for testing - just return mock results
      if (script.includes('rateLimitCheck')) {
        const key = keys[0];
        const limit = parseInt(keys[1] as string, 10);
        const window = parseInt(keys[2] as string, 10);
        const entry = store.get(key);
        if (!entry) {
          store.set(key, { value: '1', expiry: Date.now() + window });
          return [1, limit - 1, window];
        }
        const current = parseInt(entry.value, 10);
        if (current >= limit) {
          const next = current + 1;
          store.set(key, { value: next.toString(), expiry: entry.expiry });
          return [next, 0, entry.expiry ? entry.expiry - Date.now() : window];
        }
        const next = current + 1;
        store.set(key, { value: next.toString(), expiry: entry.expiry || Date.now() + window });
        return [next, limit - next, entry.expiry ? entry.expiry - Date.now() : window];
      }
      if (script.includes('threatCheck')) {
        return [0, 1];
      }
      if (script.includes('sessionValidate')) {
        return [0, 'not_found'];
      }
      return null;
    },
    async evalsha(sha: string, numKeys: number, ...keys: string[]) {
      const script = scriptCache.get(sha) ?? '';
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

describe('SecurityRedisAdapter', () => {
  let mockClient: RedisClient;
  let adapter: SecurityRedisAdapter;

  beforeEach(() => {
    mockClient = createMockRedisClient();
    adapter = SecurityRedisAdapterFactory.create(mockClient);
  });

  describe('Session Management', () => {
    it('should create and retrieve session', async () => {
      const context = SecurityContextEntity.createAuthenticated(
        'user-123',
        ['admin'],
        ['read', 'write'],
        '192.168.1.1',
        'Mozilla/5.0',
        SecurityLevel.HIGH
      );

      await adapter.createSession('session-123', context);
      const retrieved = await adapter.getSession('session-123');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.userId).toBe('user-123');
      expect(retrieved!.roles).toEqual(['admin']);
      expect(retrieved!.permissions).toEqual(['read', 'write']);
      expect(retrieved!.ipAddress).toBe('192.168.1.1');
    });

    it('should return null for non-existent session', async () => {
      const session = await adapter.getSession('non-existent');
      expect(session).toBeNull();
    });

    it('should delete session', async () => {
      const context = SecurityContextEntity.createUnauthenticated('192.168.1.1', 'Mozilla/5.0');
      await adapter.createSession('session-123', context);

      const deleted = await adapter.deleteSession('session-123');
      expect(deleted).toBe(true);

      const retrieved = await adapter.getSession('session-123');
      expect(retrieved).toBeNull();
    });

    it('should extend session TTL', async () => {
      const context = SecurityContextEntity.createUnauthenticated('192.168.1.1', 'Mozilla/5.0');
      await adapter.createSession('session-123', context, 1000); // 1 second

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const extended = await adapter.extendSession('session-123', 5000);
      expect(extended).toBe(true);

      const retrieved = await adapter.getSession('session-123');
      expect(retrieved).not.toBeNull();
    });
  });

  describe('Threat Detection', () => {
    it('should record and retrieve threats', async () => {
      const threat = ThreatEntity.fromBasic(
        ThreatType.SQL_INJECTION,
        ThreatSeverity.HIGH,
        'SQL injection attempt',
        '192.168.1.1',
        { query: 'SELECT * FROM users' }
      );

      await adapter.recordThreat(threat);
      const threats = await adapter.getThreatsByIp('192.168.1.1');

      expect(threats.length).toBe(1);
      expect(threats[0].type).toBe(ThreatType.SQL_INJECTION);
      expect(threats[0].severity).toBe(ThreatSeverity.HIGH);
    });

    it('should increment threat count', async () => {
      const count1 = await adapter.incrementThreatCount('192.168.1.1', ThreatType.XSS, 60000);
      const count2 = await adapter.incrementThreatCount('192.168.1.1', ThreatType.XSS, 60000);

      expect(count1).toBe(1);
      expect(count2).toBe(2);
    });

    it('should get threat count', async () => {
      await adapter.incrementThreatCount('192.168.1.1', ThreatType.BRUTE_FORCE, 60000);
      await adapter.incrementThreatCount('192.168.1.1', ThreatType.BRUTE_FORCE, 60000);

      const count = await adapter.getThreatCount('192.168.1.1', ThreatType.BRUTE_FORCE, 60000);
      expect(count).toBe(2);
    });
  });

  describe('Policy Management', () => {
    it('should save and retrieve policy', async () => {
      const policy = PolicyEntity.createSimple(
        'policy-1',
        'Admin Policy',
        'Policy for admins',
        SecurityLevel.HIGH,
        [{ resource: '/admin', action: '*', effect: 'allow' }]
      );

      await adapter.savePolicy(policy);
      const retrieved = await adapter.getPolicy('policy-1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('policy-1');
      expect(retrieved!.name).toBe('Admin Policy');
    });

    it('should get all policies', async () => {
      const policy1 = PolicyEntity.createSimple('p1', 'Policy 1', 'Desc', SecurityLevel.LOW, []);
      const policy2 = PolicyEntity.createSimple('p2', 'Policy 2', 'Desc', SecurityLevel.HIGH, []);

      await adapter.savePolicy(policy1);
      await adapter.savePolicy(policy2);

      const policies = await adapter.getAllPolicies();
      expect(policies.length).toBe(2);
    });

    it('should delete policy', async () => {
      const policy = PolicyEntity.createSimple('policy-1', 'Policy', 'Desc', SecurityLevel.MEDIUM, []);
      await adapter.savePolicy(policy);

      const deleted = await adapter.deletePolicy('policy-1');
      expect(deleted).toBe(true);

      const retrieved = await adapter.getPolicy('policy-1');
      expect(retrieved).toBeNull();
    });
  });

  describe('Rate Limiting', () => {
    it('should check rate limit', async () => {
      const result = await adapter.checkRateLimit('user-123', 10, 60000);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.remaining).toBe(9);
    });

    it('should enforce rate limit', async () => {
      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        const result = await adapter.checkRateLimit('user-456', 10, 60000);
        expect(result.allowed).toBe(true);
      }

      // 11th request should be denied
      const result = await adapter.checkRateLimit('user-456', 10, 60000);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(11);
      expect(result.remaining).toBe(0);
    });

    it('should reset rate limit', async () => {
      await adapter.checkRateLimit('user-789', 5, 60000);
      await adapter.checkRateLimit('user-789', 5, 60000);

      await adapter.resetRateLimit('user-789');

      const result = await adapter.checkRateLimit('user-789', 5, 60000);
      expect(result.current).toBe(1);
    });
  });

  describe('IP Reputation', () => {
    it('should set and get IP reputation', async () => {
      await adapter.setIpReputation('192.168.1.1', 0.9);
      const score = await adapter.getIpReputation('192.168.1.1');

      expect(score).toBe(0.9);
    });

    it('should return null for unknown IP', async () => {
      const score = await adapter.getIpReputation('10.0.0.1');
      expect(score).toBeNull();
    });
  });

  describe('IP Blocklist', () => {
    it('should add and check IP blocklist', async () => {
      await adapter.addToIpBlocklist('192.168.1.100', 'Malicious activity');
      const blocked = await adapter.isIpBlocked('192.168.1.100');

      expect(blocked).toBe(true);
    });

    it('should remove from blocklist', async () => {
      await adapter.addToIpBlocklist('192.168.1.100', 'Malicious activity');
      await adapter.removeFromIpBlocklist('192.168.1.100');

      const blocked = await adapter.isIpBlocked('192.168.1.100');
      expect(blocked).toBe(false);
    });
  });

  describe('Nonce Management', () => {
    it('should store and check nonce', async () => {
      await adapter.storeNonce('nonce-123', '192.168.1.1');
      const ip = await adapter.checkNonce('nonce-123');

      expect(ip).toBe('192.168.1.1');
    });

    it('should consume nonce', async () => {
      await adapter.storeNonce('nonce-456', '192.168.1.1');
      const consumed = await adapter.consumeNonce('nonce-456');

      expect(consumed).toBe(true);

      const ip = await adapter.checkNonce('nonce-456');
      expect(ip).toBeNull();
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
      expect(config.keyPrefix).toBe('security:');
      expect(config.defaultTtlMs).toBe(3600000);
    });

    it('should update config', () => {
      adapter.updateConfig({ keyPrefix: 'custom:' });
      const config = adapter.getConfig();
      expect(config.keyPrefix).toBe('custom:');
    });
  });
});

describe('SecurityRedisAdapterFactory', () => {
  let mockClient: RedisClient;

  beforeEach(() => {
    mockClient = createMockRedisClient();
  });

  it('should create adapter with options', () => {
    const adapter = SecurityRedisAdapterFactory.create(mockClient, { keyPrefix: 'test:' });
    expect(adapter).toBeInstanceOf(SecurityRedisAdapter);
    expect(adapter.getConfig().keyPrefix).toBe('test:');
  });

  it('should create adapter with defaults', () => {
    const adapter = SecurityRedisAdapterFactory.createWithDefaults(mockClient);
    expect(adapter).toBeInstanceOf(SecurityRedisAdapter);
    expect(adapter.getConfig().keyPrefix).toBe('security:');
  });
});