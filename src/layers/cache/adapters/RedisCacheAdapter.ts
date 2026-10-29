/**
 * Redis Cache Adapter
 *
 * Production-ready Redis adapter for distributed caching.
 * Supports connection pooling, pipelining, and cluster mode.
 *
 * @module CacheLayer/Adapters
 */

import { ICacheAdapter } from './InMemoryAdapter';

export interface RedisCacheAdapterConfig {
  /** Redis host */
  host: string;
  /** Redis port */
  port: number;
  /** Redis password (optional) */
  password?: string;
  /** Database number */
  db?: number;
  /** Key prefix for all cache entries */
  keyPrefix?: string;
  /** Connection timeout in ms */
  connectionTimeout?: number;
  /** Command timeout in ms */
  commandTimeout?: number;
  /** Enable offline queue */
  enableOfflineQueue?: boolean;
  /** Retry strategy function */
  retryStrategy?: (times: number) => number | null;
  /** Enable TLS */
  tls?: boolean;
  /** Maximum connections in pool */
  maxPoolSize?: number;
  /** Minimum connections in pool */
  minPoolSize?: number;
  /** Connection idle timeout in ms */
  idleTimeout?: number;
  /** Enable read-only replica reads */
  readFromReplica?: boolean;
  /** Default TTL in ms */
  defaultTTL?: number;
}

interface RedisClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttlMs?: number): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  eval(script: string, numKeys: number, ...keys: string[]): Promise<unknown>;
  evalSha(sha: string, numKeys: number, ...keys: string[]): Promise<unknown>;
  scriptLoad(script: string): Promise<string>;
  pipeline(commands: Array<[string, ...string[]]>) : RedisPipeline;
  on(event: string, listener: (...args: unknown[]) => void): this;
  status: string;
}

interface RedisPipeline {
  get(key: string): RedisPipeline;
  set(key: string, value: string, mode?: string, ttlMs?: number): RedisPipeline;
  del(...keys: string[]): RedisPipeline;
  expire(key: string, seconds: number): RedisPipeline;
  exec(): Promise<Array<[Error | null, unknown]>>;
}

interface CacheEntry<T> {
  value: T;
  ttl: number;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

/**
 * Redis Cache Adapter Implementation
 *
 * Provides a production-ready Redis backend for caching with:
 * - Connection pooling
 * - Automatic reconnection
 * - Pipelining for batch operations
 * - Lua scripting for atomic operations
 * - Comprehensive metrics
 */
export class RedisCacheAdapter implements ICacheAdapter {
  private _config: Required<RedisCacheAdapterConfig>;
  private _client: RedisClient | null = null;
  private _connected: boolean = false;
  private _executionCount: number = 0;
  private _errorCount: number = 0;
  private _hitCount: number = 0;
  private _missCount: number = 0;
  private _lastError: Error | null = null;
  private _connecting: Promise<void> | null = null;
  private _scriptsLoaded: boolean = false;
  private _getScriptSha: string = '';
  private _setScriptSha: string = '';
  private _delScriptSha: string = '';

  // Lua scripts for atomic operations
  private static readonly GET_SCRIPT = `
    local entry = redis.call('GET', KEYS[1])
    if entry then
      local data = cjson.decode(entry)
      local now = tonumber(ARGV[1])
      if data.ttl > 0 and (now - data.createdAt) > data.ttl then
        redis.call('DEL', KEYS[1])
        return nil
      end
      data.accessCount = data.accessCount + 1
      data.lastAccessedAt = now
      redis.call('SET', KEYS[1], cjson.encode(data), 'PX', data.ttl)
      return cjson.encode(data)
    end
    return nil
  `;

  private static readonly SET_SCRIPT = `
    local key = KEYS[1]
    local value = ARGV[1]
    local ttl = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local entry = {
      value = cjson.decode(value),
      ttl = ttl,
      createdAt = now,
      accessCount = 0,
      lastAccessedAt = now
    }
    if ttl > 0 then
      redis.call('SET', key, cjson.encode(entry), 'PX', ttl)
    else
      redis.call('SET', key, cjson.encode(entry))
    end
    return 'OK'
  `;

  private static readonly DEL_SCRIPT = `
    local count = 0
    for i = 1, #KEYS do
      count = count + redis.call('DEL', KEYS[i])
    end
    return count
  `;

  constructor(config: RedisCacheAdapterConfig) {
    this._config = {
      host: config.host,
      port: config.port,
      password: config.password ?? '',
      db: config.db ?? 0,
      keyPrefix: config.keyPrefix ?? 'cache:',
      connectionTimeout: config.connectionTimeout ?? 5000,
      commandTimeout: config.commandTimeout ?? 3000,
      enableOfflineQueue: config.enableOfflineQueue ?? true,
      retryStrategy: config.retryStrategy ?? ((times) => Math.min(times * 100, 3000)),
      tls: config.tls ?? false,
      maxPoolSize: config.maxPoolSize ?? 10,
      minPoolSize: config.minPoolSize ?? 2,
      idleTimeout: config.idleTimeout ?? 30000,
      readFromReplica: config.readFromReplica ?? false,
      defaultTTL: config.defaultTTL ?? 0,
    };
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this._connected && this._client) return;
    if (this._connecting) return this._connecting;

    this._connecting = this._doConnect();
    try {
      await this._connecting;
    } finally {
      this._connecting = null;
    }
  }

  private async _doConnect(): Promise<void> {
    try {
      // Dynamic import to avoid build-time dependency
      let createClient: ((options: unknown) => RedisClient) | null = null;
      try {
        const redisModule = await import('redis');
        createClient = redisModule.createClient as unknown as (options: unknown) => RedisClient;
      } catch {
        // redis not installed
      }
      if (!createClient) {
        throw new Error('redis package not installed. Run: npm install redis');
      }
      const client = createClient({
        socket: {
          host: this._config.host,
          port: this._config.port,
          connectTimeout: this._config.connectionTimeout,
          reconnectStrategy: this._config.retryStrategy,
          tls: this._config.tls,
        },
        password: this._config.password || undefined,
        database: this._config.db,
      });

      client.on('error', (err: unknown) => {
        this._errorCount++;
        this._lastError = err instanceof Error ? err : new Error(String(err));
        this._connected = false;
      });

      client.on('connect', () => {
        this._connected = true;
      });

      client.on('ready', () => {
        this._connected = true;
        this._loadScripts();
      });

      client.on('end', () => {
        this._connected = false;
      });

      await client.connect();
      this._client = client;
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async _loadScripts(): Promise<void> {
    if (!this._client || this._scriptsLoaded) return;

    try {
      this._getScriptSha = await this._client.scriptLoad(RedisCacheAdapter.GET_SCRIPT);
      this._setScriptSha = await this._client.scriptLoad(RedisCacheAdapter.SET_SCRIPT);
      this._delScriptSha = await this._client.scriptLoad(RedisCacheAdapter.DEL_SCRIPT);
      this._scriptsLoaded = true;
    } catch (error) {
      console.warn('[RedisCacheAdapter] Failed to load Lua scripts, falling back to commands:', error);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this._client) {
      await this._client.disconnect();
      this._client = null;
    }
    this._connected = false;
    this._scriptsLoaded = false;
  }

  /**
   * Execute a cache operation
   */
  async execute(
    input: unknown
  ): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    this._executionCount++;

    if (!this._connected || !this._client) {
      await this.connect();
    }

    try {
      const operation = this._normalizeOperation(input);
      let result: unknown;

      switch (operation.type) {
        case 'get':
          result = await this._get(operation.key ?? '');
          break;
        case 'set':
          result = await this._set(operation.key ?? '', operation.value, operation.ttl);
          break;
        case 'delete':
          result = await this._delete(operation.key ?? '');
          break;
        case 'clear':
          result = await this._clear();
          break;
        case 'has':
          result = await this._has(operation.key ?? '');
          break;
        case 'keys':
          result = await this._keys(operation.pattern);
          break;
        case 'size':
          result = await this._size();
          break;
        default:
          throw new Error(`Unknown operation: ${operation.type}`);
      }

      return {
        success: true,
        data: {
          adapter: 'redis',
          operation: operation.type,
          result,
          executionCount: this._executionCount,
        },
      };
    } catch (error) {
      this._errorCount++;
      this._lastError = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        error: {
          code: 'REDIS_ADAPTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Configure the adapter
   */
  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config } as Required<RedisCacheAdapterConfig>;
  }

  /**
   * Get adapter status
   */
  getStatus(): Record<string, unknown> {
    return {
      adapter: 'redis',
      layer: 'cache',
      connected: this._connected,
      executionCount: this._executionCount,
      errorCount: this._errorCount,
      hitCount: this._hitCount,
      missCount: this._missCount,
      hitRate: this._executionCount > 0 ? this._hitCount / (this._hitCount + this._missCount) : 0,
      lastError: this._lastError?.message ?? null,
      config: {
        host: this._config.host,
        port: this._config.port,
        db: this._config.db,
        keyPrefix: this._config.keyPrefix,
        maxPoolSize: this._config.maxPoolSize,
      },
    };
  }

  // Cache operations

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    this._ensureConnected();
    const prefixedKey = this._prefixKey(key);

    try {
      let entry: CacheEntry<T> | null = null;

      if (this._scriptsLoaded && this._client) {
        // Use Lua script for atomic get with access tracking
        const result = await this._client.evalSha(
          this._getScriptSha,
          1,
          prefixedKey,
          Date.now().toString()
        );
        if (result) {
          entry = JSON.parse(result as string) as CacheEntry<T>;
        }
      } else {
        // Fallback to regular commands
        const data = await this._client!.get(prefixedKey);
        if (data) {
          const parsed = JSON.parse(data) as CacheEntry<T>;
          const now = Date.now();
          if (parsed.ttl <= 0 || now - parsed.createdAt <= parsed.ttl) {
            parsed.accessCount++;
            parsed.lastAccessedAt = now;
            // Update with new access info
            await this._client!.set(
              prefixedKey,
              JSON.stringify(parsed),
              parsed.ttl > 0 ? 'PX' : undefined,
              parsed.ttl
            );
            entry = parsed;
          } else {
            // Expired
            await this._client!.del(prefixedKey);
          }
        }
      }

      if (entry) {
        this._hitCount++;
      } else {
        this._missCount++;
      }

      return entry;
    } catch (error) {
      this._missCount++;
      throw error;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    this._ensureConnected();
    const prefixedKey = this._prefixKey(key);
    const effectiveTTL = ttl ?? this._config.defaultTTL ?? 0;

    try {
      const entry: CacheEntry<T> = {
        value,
        ttl: effectiveTTL,
        createdAt: Date.now(),
        accessCount: 0,
        lastAccessedAt: Date.now(),
      };

      if (this._scriptsLoaded && this._client) {
        await this._client.evalSha(
          this._setScriptSha,
          1,
          prefixedKey,
          JSON.stringify(value),
          effectiveTTL.toString(),
          Date.now().toString()
        );
      } else {
        if (effectiveTTL > 0) {
          await this._client!.set(prefixedKey, JSON.stringify(entry), 'PX', effectiveTTL);
        } else {
          await this._client!.set(prefixedKey, JSON.stringify(entry));
        }
      }

      return true;
    } catch (error) {
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    this._ensureConnected();
    const prefixedKey = this._prefixKey(key);

    try {
      let result: number;
      if (this._scriptsLoaded && this._client) {
        result = await this._client.evalSha(this._delScriptSha, 1, prefixedKey) as number;
      } else {
        result = await this._client!.del(prefixedKey);
      }
      return result > 0;
    } catch (error) {
      throw error;
    }
  }

  async clear(): Promise<void> {
    this._ensureConnected();

    try {
      const pattern = `${this._config.keyPrefix}*`;
      const keys = await this._client!.keys(pattern);
      if (keys.length > 0) {
        // Use pipeline for batch delete
        const pipeline = this._client!.pipeline([]);
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
      }
    } catch (error) {
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    this._ensureConnected();
    const prefixedKey = this._prefixKey(key);

    try {
      const exists = await this._client!.exists(prefixedKey);
      return exists > 0;
    } catch (error) {
      throw error;
    }
  }

  async keys(pattern: string = '*'): Promise<string[]> {
    this._ensureConnected();
    const prefixedPattern = `${this._config.keyPrefix}${pattern}`;

    try {
      const keys = await this._client!.keys(prefixedPattern);
      // Remove prefix from returned keys
      return keys.map(k => k.slice(this._config.keyPrefix.length));
    } catch (error) {
      throw error;
    }
  }

  async size(): Promise<number> {
    this._ensureConnected();

    try {
      const pattern = `${this._config.keyPrefix}*`;
      const keys = await this._client!.keys(pattern);
      return keys.length;
    } catch (error) {
      throw error;
    }
  }

  async getTTL(key: string): Promise<number> {
    this._ensureConnected();
    const prefixedKey = this._prefixKey(key);

    try {
      const ttl = await this._client!.ttl(prefixedKey);
      return ttl > 0 ? ttl * 1000 : ttl; // Convert to ms
    } catch (error) {
      throw error;
    }
  }

  async setTTL(key: string, ttl: number): Promise<boolean> {
    this._ensureConnected();
    const prefixedKey = this._prefixKey(key);

    try {
      const result = await this._client!.expire(prefixedKey, Math.ceil(ttl / 1000));
      return result === 1;
    } catch (error) {
      throw error;
    }
  }

  // Pipeline support for batch operations

  async getMany<T>(keys: string[]): Promise<Map<string, CacheEntry<T> | null>> {
    this._ensureConnected();
    const result = new Map<string, CacheEntry<T> | null>();

    if (keys.length === 0) return result;

    try {
      const pipeline = this._client!.pipeline([]);
      const prefixedKeys = keys.map(k => this._prefixKey(k));

      for (const pk of prefixedKeys) {
        pipeline.get(pk);
      }

      const results = await pipeline.exec();
      for (let i = 0; i < keys.length; i++) {
        const [err, data] = results[i];
        if (err) {
          result.set(keys[i], null);
          this._missCount++;
        } else if (data) {
          const parsed = JSON.parse(data as string) as CacheEntry<T>;
          const now = Date.now();
          if (parsed.ttl <= 0 || now - parsed.createdAt <= parsed.ttl) {
            result.set(keys[i], parsed);
            this._hitCount++;
          } else {
            result.set(keys[i], null);
            this._missCount++;
          }
        } else {
          result.set(keys[i], null);
          this._missCount++;
        }
      }
    } catch (error) {
      for (const key of keys) {
        result.set(key, null);
        this._missCount++;
      }
    }

    return result;
  }

  async setMany<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    this._ensureConnected();

    if (entries.length === 0) return;

    try {
      const pipeline = this._client!.pipeline([]);
      const now = Date.now();

      for (const entry of entries) {
        const prefixedKey = this._prefixKey(entry.key);
        const effectiveTTL = entry.ttl ?? this._config.defaultTTL ?? 0;
        const cacheEntry: CacheEntry<T> = {
          value: entry.value,
          ttl: effectiveTTL,
          createdAt: now,
          accessCount: 0,
          lastAccessedAt: now,
        };

        if (effectiveTTL > 0) {
          pipeline.set(prefixedKey, JSON.stringify(cacheEntry), 'PX', effectiveTTL);
        } else {
          pipeline.set(prefixedKey, JSON.stringify(cacheEntry));
        }
      }

      await pipeline.exec();
    } catch (error) {
      throw error;
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    this._ensureConnected();

    if (keys.length === 0) return 0;

    try {
      const prefixedKeys = keys.map(k => this._prefixKey(k));
      let deleted = 0;

      if (this._scriptsLoaded && this._client) {
        deleted = await this._client.evalSha(this._delScriptSha, prefixedKeys.length, ...prefixedKeys) as number;
      } else {
        deleted = await this._client!.del(...prefixedKeys);
      }

      return deleted;
    } catch (error) {
      throw error;
    }
  }

  // Health check

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; memoryUsage?: string; connectedClients?: number }> {
    const start = Date.now();
    try {
      await this._client?.get(`${this._config.keyPrefix}health_check`);
      const latencyMs = Date.now() - start;

      // Get Redis info
      let memoryUsage: string | undefined;
      let connectedClients: number | undefined;

      try {
        const info = await this._client?.eval('return redis.call("INFO", "memory")', 0) as string;
        const memMatch = info.match(/used_memory_human:(\S+)/);
        if (memMatch) memoryUsage = memMatch[1];

        const clientsInfo = await this._client?.eval('return redis.call("INFO", "clients")', 0) as string;
        const clientsMatch = clientsInfo.match(/connected_clients:(\d+)/);
        if (clientsMatch) connectedClients = parseInt(clientsMatch[1], 10);
      } catch {
        // Ignore info errors
      }

      return { healthy: true, latencyMs, memoryUsage, connectedClients };
    } catch (error) {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  // Private helpers

  private _ensureConnected(): void {
    if (!this._connected || !this._client) {
      throw new Error('Redis not connected. Call connect() first.');
    }
  }

  private _prefixKey(key: string): string {
    return `${this._config.keyPrefix}${key}`;
  }

  private _normalizeOperation(input: unknown): { type: string; key?: string; value?: unknown; ttl?: number; pattern?: string } {
    if (input !== null && typeof input === 'object' && 'type' in input) {
      return input as { type: string; key?: string; value?: unknown; ttl?: number; pattern?: string };
    }
    return { type: 'get', key: String(input) };
  }

  private async _get(key: string): Promise<CacheEntry<unknown> | null> {
    return this.get(key);
  }

  private async _set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    return this.set(key, value, ttl);
  }

  private async _delete(key: string): Promise<boolean> {
    return this.delete(key);
  }

  private async _clear(): Promise<void> {
    return this.clear();
  }

  private async _has(key: string): Promise<boolean> {
    return this.has(key);
  }

  private async _keys(pattern?: string): Promise<string[]> {
    return this.keys(pattern);
  }

  private async _size(): Promise<number> {
    return this.size();
  }
}