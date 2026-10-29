/**
 * Security Redis Adapter
 *
 * Real implementation using Redis for distributed security operations.
 *
 * @module SecurityLayer/Adapters
 */

import { SecurityInMemoryAdapter } from './InMemoryAdapter';
import { SecurityErrorFactory } from '../errors';
import { SecurityConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { SecurityContextEntity } from '../domain/entities/SecurityContextEntity';
import { ThreatEntity } from '../domain/entities/ThreatEntity';
import { PolicyEntity } from '../domain/entities/PolicyEntity';
import { SecurityLevel, ThreatType, ThreatSeverity } from '../types/security-types';

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
}

export interface SecurityRedisAdapterOptions {
  client: RedisClient;
  keyPrefix: string;
  defaultTtlMs: number;
  enableThreatCache: boolean;
  enablePolicyCache: boolean;
  enableSessionCache: boolean;
  enableRateLimitCache: boolean;
}

const DEFAULT_OPTIONS: Partial<SecurityRedisAdapterOptions> = {
  keyPrefix: 'security:',
  defaultTtlMs: 3600000, // 1 hour
  enableThreatCache: true,
  enablePolicyCache: true,
  enableSessionCache: true,
  enableRateLimitCache: true,
};

export class SecurityRedisAdapter extends SecurityInMemoryAdapter {
  private readonly client: RedisClient;
  private readonly options: SecurityRedisAdapterOptions;
  private readonly luaScripts: Map<string, string>;

  constructor(options: SecurityRedisAdapterOptions) {
    super();
    this.client = options.client;
    this.options = { ...DEFAULT_OPTIONS, ...options } as SecurityRedisAdapterOptions;
    this.luaScripts = new Map();
    this.initializeScripts();
  }

  private initializeScripts(): void {
    // Rate limit check script (atomic check-and-increment)
    this.luaScripts.set(
      'rateLimitCheck',
      `-- rateLimitCheck
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local current = redis.call('GET', key)
      if current == false then
        redis.call('SET', key, 1, 'PX', window)
        return {1, limit - 1, window}
      end
      if tonumber(current) >= limit then
        local ttl = redis.call('PTTL', key)
        redis.call('INCR', key)
        return {tonumber(current) + 1, 0, ttl}
      end
      local incr = redis.call('INCR', key)
      if incr == 1 then
        redis.call('PEXPIRE', key, window)
      end
      return {incr, limit - incr, redis.call('PTTL', key)}
      `
    );

    // Threat detection script
    this.luaScripts.set(
      'threatCheck',
      `
      local ipKey = KEYS[1]
      local threatType = ARGV[1]
      local threshold = tonumber(ARGV[2])
      local window = tonumber(ARGV[3])
      local count = redis.call('INCR', ipKey .. ':' .. threatType)
      if count == 1 then
        redis.call('PEXPIRE', ipKey .. ':' .. threatType, window)
      end
      if count >= threshold then
        return {1, count}
      end
      return {0, count}
      `
    );

    // Session validation script
    this.luaScripts.set(
      'sessionValidate',
      `
      local sessionKey = KEYS[1]
      local maxAge = tonumber(ARGV[1])
      local data = redis.call('GET', sessionKey)
      if data == false then
        return {0, 'not_found'}
      end
      local session = cjson.decode(data)
      local age = tonumber(ARGV[2]) - session.createdAt
      if age > maxAge then
        redis.call('DEL', sessionKey)
        return {0, 'expired'}
      end
      return {1, data}
      `
    );
  }

  private getKey(suffix: string): string {
    return `${this.options.keyPrefix}${suffix}`;
  }

  // Session Management
  async createSession(sessionId: string, context: SecurityContextEntity, ttlMs?: number): Promise<void> {
    const key = this.getKey(`session:${sessionId}`);
    const data = JSON.stringify({
      ...context.toJSON(),
      createdAt: Date.now(),
    });
    await this.client.set(key, data, 'PX', ttlMs ?? this.options.defaultTtlMs);
  }

  async getSession(sessionId: string): Promise<SecurityContextEntity | null> {
    const key = this.getKey(`session:${sessionId}`);
    const data = await this.client.get(key);
    if (!data) return null;

    try {
      const parsed = JSON.parse(data);
      return SecurityContextEntity.fromJSON(parsed);
    } catch {
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const key = this.getKey(`session:${sessionId}`);
    const result = await this.client.del(key);
    return result > 0;
  }

  async extendSession(sessionId: string, ttlMs: number): Promise<boolean> {
    const key = this.getKey(`session:${sessionId}`);
    const result = await this.client.pexpire(key, ttlMs);
    return result === 1;
  }

  // Threat Detection
  async recordThreat(threat: ThreatEntity): Promise<void> {
    if (!this.options.enableThreatCache) return;

    const key = this.getKey(`threats:${threat.sourceIp}:${threat.type}`);
    const data = JSON.stringify(threat.toJSON());
    await this.client.set(key, data, 'PX', this.options.defaultTtlMs);

    // Also add to IP threat set
    const ipThreatKey = this.getKey(`ip:threats:${threat.sourceIp}`);
    await this.client.sadd(ipThreatKey, threat.type);
    await this.client.pexpire(ipThreatKey, this.options.defaultTtlMs);
  }

  async getThreatsByIp(ip: string): Promise<ThreatEntity[]> {
    const ipThreatKey = this.getKey(`ip:threats:${ip}`);
    const threatTypes = await this.client.smembers(ipThreatKey);
    const threats: ThreatEntity[] = [];

    for (const type of threatTypes) {
      const key = this.getKey(`threats:${ip}:${type}`);
      const data = await this.client.get(key);
      if (data) {
        try {
          threats.push(ThreatEntity.fromJSON(JSON.parse(data)));
        } catch {
          // Skip invalid entries
        }
      }
    }

    return threats;
  }

  async getThreatCount(ip: string, type: ThreatType, windowMs: number): Promise<number> {
    const key = this.getKey(`threat:count:${ip}:${type}`);
    const count = await this.client.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  async incrementThreatCount(ip: string, type: ThreatType, windowMs: number): Promise<number> {
    const key = this.getKey(`threat:count:${ip}:${type}`);
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.pexpire(key, windowMs);
    }
    return count;
  }

  // Policy Management
  async savePolicy(policy: PolicyEntity): Promise<void> {
    if (!this.options.enablePolicyCache) return;

    const key = this.getKey(`policy:${policy.id}`);
    const data = JSON.stringify(policy.toJSON());
    await this.client.set(key, data, 'PX', this.options.defaultTtlMs);

    // Add to policy index
    const indexKey = this.getKey('policies:index');
    await this.client.sadd(indexKey, policy.id);
  }

  async getPolicy(policyId: string): Promise<PolicyEntity | null> {
    const key = this.getKey(`policy:${policyId}`);
    const data = await this.client.get(key);
    if (!data) return null;

    try {
      return PolicyEntity.fromJSON(JSON.parse(data));
    } catch {
      return null;
    }
  }

  async getAllPolicies(): Promise<PolicyEntity[]> {
    const indexKey = this.getKey('policies:index');
    const policyIds = await this.client.smembers(indexKey);
    const policies: PolicyEntity[] = [];

    for (const id of policyIds) {
      const policy = await this.getPolicy(id);
      if (policy) policies.push(policy);
    }

    return policies;
  }

  async deletePolicy(policyId: string): Promise<boolean> {
    const key = this.getKey(`policy:${policyId}`);
    const result = await this.client.del(key);
    if (result > 0) {
      const indexKey = this.getKey('policies:index');
      await this.client.srem(indexKey, policyId);
    }
    return result > 0;
  }

  // Rate Limiting (distributed)
  async checkRateLimit(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<{
    allowed: boolean;
    current: number;
    remaining: number;
    resetTime: number;
  }> {
    if (!this.options.enableRateLimitCache) {
      return { allowed: true, current: 0, remaining: limit, resetTime: Date.now() + windowMs };
    }

    const key = this.getKey(`ratelimit:${identifier}`);
    const script = this.luaScripts.get('rateLimitCheck')!;
    const sha = await this.client.scriptLoad(script);
    const result = (await this.client.evalsha(sha, 1, key, limit.toString(), windowMs.toString())) as number[];

    const [current, remaining, ttl] = result;
    return {
      allowed: current <= limit,
      current,
      remaining: Math.max(0, remaining),
      resetTime: Date.now() + ttl,
    };
  }

  async resetRateLimit(identifier: string): Promise<void> {
    const key = this.getKey(`ratelimit:${identifier}`);
    await this.client.del(key);
  }

  // IP Reputation
  async setIpReputation(ip: string, score: number, ttlMs?: number): Promise<void> {
    const key = this.getKey(`ip:reputation:${ip}`);
    await this.client.set(key, score.toString(), 'PX', ttlMs ?? this.options.defaultTtlMs);
  }

  async getIpReputation(ip: string): Promise<number | null> {
    const key = this.getKey(`ip:reputation:${ip}`);
    const score = await this.client.get(key);
    return score ? parseFloat(score) : null;
  }

  async addToIpBlocklist(ip: string, reason: string, ttlMs?: number): Promise<void> {
    const key = this.getKey(`ip:blocklist:${ip}`);
    await this.client.set(key, reason, 'PX', ttlMs ?? this.options.defaultTtlMs);
  }

  async isIpBlocked(ip: string): Promise<boolean> {
    const key = this.getKey(`ip:blocklist:${ip}`);
    const exists = await this.client.exists(key);
    return exists > 0;
  }

  async removeFromIpBlocklist(ip: string): Promise<boolean> {
    const key = this.getKey(`ip:blocklist:${ip}`);
    const result = await this.client.del(key);
    return result > 0;
  }

  // Nonce Management
  async storeNonce(nonce: string, ip: string, ttlMs?: number): Promise<void> {
    const key = this.getKey(`nonce:${nonce}`);
    await this.client.set(key, ip, 'PX', ttlMs ?? 300000); // 5 min default
  }

  async checkNonce(nonce: string): Promise<string | null> {
    const key = this.getKey(`nonce:${nonce}`);
    return this.client.get(key);
  }

  async consumeNonce(nonce: string): Promise<boolean> {
    const key = this.getKey(`nonce:${nonce}`);
    const result = await this.client.del(key);
    return result > 0;
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
  getConfig(): SecurityRedisAdapterOptions {
    return { ...this.options };
  }

  updateConfig(updates: Partial<SecurityRedisAdapterOptions>): void {
    Object.assign(this.options, updates);
  }
}

/**
 * Factory for creating Redis adapter
 */
export class SecurityRedisAdapterFactory {
  static create(client: RedisClient, options?: Partial<SecurityRedisAdapterOptions>): SecurityRedisAdapter {
    return new SecurityRedisAdapter({ client, ...options } as SecurityRedisAdapterOptions);
  }

  static createWithDefaults(client: RedisClient): SecurityRedisAdapter {
    return new SecurityRedisAdapter({ client } as SecurityRedisAdapterOptions);
  }
}
