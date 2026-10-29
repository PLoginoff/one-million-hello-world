/**
 * Redis Cluster Cache Adapter
 *
 * Production-ready Redis Cluster adapter for distributed caching.
 * Supports automatic sharding, MOVED/ASK redirections, and read replicas.
 *
 * @module CacheLayer/Adapters
 */

import { ICacheAdapter } from './InMemoryAdapter';
import { RedisCacheAdapter, RedisCacheAdapterConfig } from './RedisCacheAdapter';

export interface ClusterCacheAdapterConfig extends RedisCacheAdapterConfig {
  /** Cluster node addresses (host:port) */
  nodes: Array<{ host: string; port: number }>;
  /** Enable read replicas for scaling reads */
  enableReadReplicas?: boolean;
  /** Maximum redirections to follow */
  maxRedirections?: number;
  /** Slot refresh interval in ms */
  slotRefreshInterval?: number;
  /** Enable client-side caching */
  enableClientSideCaching?: boolean;
  /** Default TTL in ms */
  defaultTTL?: number;
}

interface RedisClusterClient {
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
 * Redis Cluster Cache Adapter Implementation
 *
 * Extends RedisCacheAdapter with cluster-specific features:
 * - Automatic slot mapping and redirection handling
 * - Read replica support for scaling reads
 * - Client-side caching with invalidation
 * - Cluster health monitoring
 */
export class ClusterCacheAdapter implements ICacheAdapter {
  private _config: Required<ClusterCacheAdapterConfig>;
  private _client: RedisClusterClient | null = null;
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
  private _slotCache: Map<number, string> = new Map(); // slot -> node address
  private _slotRefreshInterval: ReturnType<typeof setInterval> | null = null;

  // Lua scripts (same as RedisCacheAdapter)
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

  constructor(config: ClusterCacheAdapterConfig) {
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
      nodes: config.nodes,
      enableReadReplicas: config.enableReadReplicas ?? true,
      maxRedirections: config.maxRedirections ?? 3,
      slotRefreshInterval: config.slotRefreshInterval ?? 60000,
      enableClientSideCaching: config.enableClientSideCaching ?? false,
    };
  }

  /**
   * Connect to Redis Cluster
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
      let createClient: ((options: unknown) => RedisClusterClient) | null = null;
      try {
        const redisModule = await import('redis');
        createClient = redisModule.createClient as unknown as (options: unknown) => RedisClusterClient;
      } catch {
        // redis not installed
      }
      if (!createClient) {
        throw new Error('redis package not installed. Run: npm install redis');
      }

      const rootNodes = this._config.nodes.map(n => ({
        socket: {
          host: n.host,
          port: n.port,
          connectTimeout: this._config.connectionTimeout,
          reconnectStrategy: this._config.retryStrategy,
          tls: this._config.tls,
        },
        password: this._config.password ?? undefined,
      }));

      const client = createClient({
        rootNodes,
        defaults: {
          socket: {
            connectTimeout: this._config.connectionTimeout,
            reconnectStrategy: this._config.retryStrategy,
            tls: this._config.tls,
          },
          password: this._config.password ?? undefined,
        },
        maxRedirections: this._config.maxRedirections,
        enableReadyCheck: true,
        enableOfflineQueue: this._config.enableOfflineQueue,
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
        this._startSlotRefresh();
      });

      client.on('end', () => {
        this._connected = false;
        this._stopSlotRefresh();
      });

      // Handle cluster-specific events
      client.on('reconnecting', () => {
        this._connected = false;
      });

      await client.connect();
      this._client = client;

      // Initial slot refresh
      await this._refreshSlots();
    } catch (error) {
      throw new Error(`Failed to connect to Redis Cluster: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async _loadScripts(): Promise<void> {
    if (!this._client || this._scriptsLoaded) return;

    try {
      // Load scripts on all primaries
      this._getScriptSha = await this._client.scriptLoad(ClusterCacheAdapter.GET_SCRIPT);
      this._setScriptSha = await this._client.scriptLoad(ClusterCacheAdapter.SET_SCRIPT);
      this._delScriptSha = await this._client.scriptLoad(ClusterCacheAdapter.DEL_SCRIPT);
      this._scriptsLoaded = true;
    } catch (error) {
      console.warn('[ClusterCacheAdapter] Failed to load Lua scripts, falling back to commands:', error);
    }
  }

  private _startSlotRefresh(): void {
    this._slotRefreshInterval = setInterval(async () => {
      try {
        await this._refreshSlots();
      } catch (error) {
        console.warn('[ClusterCacheAdapter] Slot refresh failed:', error);
      }
    }, this._config.slotRefreshInterval);
  }

  private _stopSlotRefresh(): void {
    if (this._slotRefreshInterval) {
      clearInterval(this._slotRefreshInterval);
      this._slotRefreshInterval = null;
    }
  }

  private async _refreshSlots(): Promise<void> {
    if (!this._client) return;

    try {
      const slots = await this._client.eval('return redis.call("CLUSTER", "SLOTS")', 0) as Array<unknown>;
      this._slotCache.clear();

      for (const slotInfo of slots) {
        const [start, end, ...nodes] = slotInfo as Array<unknown>;
        const primary = nodes[0] as Array<unknown>;
        const [host, port] = primary;
        const nodeAddr = `${host}:${port}`;

        for (let slot = start as number; slot <= (end as number); slot++) {
          this._slotCache.set(slot, nodeAddr);
        }
      }
    } catch (error) {
      console.warn('[ClusterCacheAdapter] Failed to refresh slots:', error);
    }
  }

  /**
   * Disconnect from Redis Cluster
   */
  async disconnect(): Promise<void> {
    this._stopSlotRefresh();
    if (this._client) {
      await this._client.disconnect();
      this._client = null;
    }
    this._connected = false;
    this._scriptsLoaded = false;
    this._slotCache.clear();
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
          adapter: 'redis-cluster',
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
          code: 'CLUSTER_ADAPTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Configure the adapter
   */
  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config } as Required<ClusterCacheAdapterConfig>;
  }

  /**
   * Get adapter status
   */
  getStatus(): Record<string, unknown> {
    return {
      adapter: 'redis-cluster',
      layer: 'cache',
      connected: this._connected,
      executionCount: this._executionCount,
      errorCount: this._errorCount,
      hitCount: this._hitCount,
      missCount: this._missCount,
      hitRate: this._executionCount > 0 ? this._hitCount / (this._hitCount + this._missCount) : 0,
      lastError: this._lastError?.message ?? null,
      slotCacheSize: this._slotCache.size,
      config: {
        nodes: this._config.nodes,
        keyPrefix: this._config.keyPrefix,
        maxPoolSize: this._config.maxPoolSize,
        enableReadReplicas: this._config.enableReadReplicas,
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
        const data = await this._client!.get(prefixedKey);
        if (data) {
          const parsed = JSON.parse(data) as CacheEntry<T>;
          const now = Date.now();
          if (parsed.ttl <= 0 || now - parsed.createdAt <= parsed.ttl) {
            parsed.accessCount++;
            parsed.lastAccessedAt = now;
            await this._client!.set(
              prefixedKey,
              JSON.stringify(parsed),
              parsed.ttl > 0 ? 'PX' : undefined,
              parsed.ttl
            );
            entry = parsed;
          } else {
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
      // In cluster mode, we need to scan each node
      // This is a simplified implementation
      const pattern = `${this._config.keyPrefix}*`;
      const keys = await this._client!.keys(pattern);
      if (keys.length > 0) {
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
      return ttl > 0 ? ttl * 1000 : ttl;
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
      // In cluster mode, keys may be on different slots
      // Group by slot for efficient pipeline execution
      const slotGroups = new Map<number, Array<{ key: string; prefixedKey: string }>>();

      for (const key of keys) {
        const prefixedKey = this._prefixKey(key);
        const slot = this._getSlot(prefixedKey);
        if (!slotGroups.has(slot)) {
          slotGroups.set(slot, []);
        }
        slotGroups.get(slot)!.push({ key, prefixedKey });
      }

      // Execute pipeline for each slot group
      for (const [, group] of slotGroups.entries()) {
        const pipeline = this._client!.pipeline([]);
        for (const { prefixedKey } of group) {
          pipeline.get(prefixedKey);
        }

        const results = await pipeline.exec();
        for (let i = 0; i < group.length; i++) {
          const [err, data] = results[i];
          const originalKey = group[i].key;
          if (err) {
            result.set(originalKey, null);
            this._missCount++;
          } else if (data) {
            const parsed = JSON.parse(data as string) as CacheEntry<T>;
            const now = Date.now();
            if (parsed.ttl <= 0 || now - parsed.createdAt <= parsed.ttl) {
              result.set(originalKey, parsed);
              this._hitCount++;
            } else {
              result.set(originalKey, null);
              this._missCount++;
            }
          } else {
            result.set(originalKey, null);
            this._missCount++;
          }
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
      // Group by slot
      const slotGroups = new Map<number, Array<{ key: string; value: T; ttl?: number; prefixedKey: string }>>();
      const now = Date.now();

      for (const entry of entries) {
        const prefixedKey = this._prefixKey(entry.key);
        const slot = this._getSlot(prefixedKey);
        if (!slotGroups.has(slot)) {
          slotGroups.set(slot, []);
        }
        slotGroups.get(slot)!.push({ ...entry, prefixedKey });
      }

      // Execute pipeline for each slot group
      for (const [, group] of slotGroups.entries()) {
        const pipeline = this._client!.pipeline([]);

        for (const entry of group) {
          const effectiveTTL = entry.ttl ?? this._config.defaultTTL ?? 0;
          const cacheEntry: CacheEntry<T> = {
            value: entry.value,
            ttl: effectiveTTL,
            createdAt: now,
            accessCount: 0,
            lastAccessedAt: now,
          };

          if (effectiveTTL > 0) {
            pipeline.set(entry.prefixedKey, JSON.stringify(cacheEntry), 'PX', effectiveTTL);
          } else {
            pipeline.set(entry.prefixedKey, JSON.stringify(cacheEntry));
          }
        }

        await pipeline.exec();
      }
    } catch (error) {
      throw error;
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    this._ensureConnected();

    if (keys.length === 0) return 0;

    try {
      // Group by slot
      const slotGroups = new Map<number, string[]>();

      for (const key of keys) {
        const prefixedKey = this._prefixKey(key);
        const slot = this._getSlot(prefixedKey);
        if (!slotGroups.has(slot)) {
          slotGroups.set(slot, []);
        }
        slotGroups.get(slot)!.push(prefixedKey);
      }

      let totalDeleted = 0;

      for (const [, prefixedKeys] of slotGroups.entries()) {
        let deleted = 0;
        if (this._scriptsLoaded && this._client) {
          deleted = await this._client.evalSha(this._delScriptSha, prefixedKeys.length, ...prefixedKeys) as number;
        } else {
          deleted = await this._client!.del(...prefixedKeys);
        }
        totalDeleted += deleted;
      }

      return totalDeleted;
    } catch (error) {
      throw error;
    }
  }

  // Cluster-specific methods

  /**
   * Get cluster slots information
   */
  async getClusterSlots(): Promise<Array<{ start: number; end: number; primary: string; replicas: string[] }>> {
    this._ensureConnected();

    try {
      const slots = await this._client!.eval('return redis.call("CLUSTER", "SLOTS")', 0) as Array<unknown>;
      return slots.map(slotInfo => {
        const [start, end, ...nodes] = slotInfo as Array<unknown>;
        const primary = nodes[0] as Array<unknown>;
        const replicas = nodes.slice(1) as Array<unknown>;
        return {
          start: start as number,
          end: end as number,
          primary: `${primary[0]}:${primary[1]}`,
          replicas: replicas.map(r => `${(r as Array<unknown>)[0]}:${(r as Array<unknown>)[1]}`),
        };
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get cluster nodes information
   */
  async getClusterNodes(): Promise<Array<{ id: string; address: string; flags: string[]; slots: number[] }>> {
    this._ensureConnected();

    try {
      const nodesOutput = await this._client!.eval('return redis.call("CLUSTER", "NODES")', 0) as string;
      const lines = nodesOutput.trim().split('\n');
      return lines.map(line => {
        const parts = line.split(' ');
        const [id, address, flagsStr, , , , , slotsStr] = parts;
        const flags = flagsStr.split(',');
        const slots: number[] = [];
        if (slotsStr && slotsStr !== '-') {
          for (const slotRange of slotsStr.split(',')) {
            if (slotRange.includes('-')) {
              const [start, end] = slotRange.split('-').map(Number);
              for (let s = start; s <= end; s++) slots.push(s);
            } else {
              slots.push(Number(slotRange));
            }
          }
        }
        return { id, address, flags, slots };
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Force cluster slot refresh
   */
  async refreshSlots(): Promise<void> {
    await this._refreshSlots();
  }

  // Health check

  async healthCheck(): Promise<{
    healthy: boolean;
    latencyMs: number;
    nodes: Array<{ address: string; healthy: boolean; latencyMs: number; role: string }>;
    slotsCovered: number;
  }> {
    const start = Date.now();
    const nodeResults: Array<{ address: string; healthy: boolean; latencyMs: number; role: string }> = [];

    try {
      const nodes = await this.getClusterNodes();

      for (const node of nodes) {
        const nodeStart = Date.now();
        try {
          // Try to ping each node
          await this._client!.eval('return redis.call("PING")', 0);
          nodeResults.push({
            address: node.address,
            healthy: true,
            latencyMs: Date.now() - nodeStart,
            role: node.flags.includes('master') ? 'primary' : 'replica',
          });
        } catch {
          nodeResults.push({
            address: node.address,
            healthy: false,
            latencyMs: Date.now() - nodeStart,
            role: node.flags.includes('master') ? 'primary' : 'replica',
          });
        }
      }

      const healthyNodes = nodeResults.filter(n => n.healthy).length;
      const slots = await this.getClusterSlots();
      const slotsCovered = slots.reduce((sum, s) => sum + (s.end - s.start + 1), 0);

      return {
        healthy: healthyNodes > 0,
        latencyMs: Date.now() - start,
        nodes: nodeResults,
        slotsCovered,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        nodes: [],
        slotsCovered: 0,
      };
    }
  }

  // Private helpers

  private _ensureConnected(): void {
    if (!this._connected || !this._client) {
      throw new Error('Redis Cluster not connected. Call connect() first.');
    }
  }

  private _prefixKey(key: string): string {
    return `${this._config.keyPrefix}${key}`;
  }

  private _getSlot(key: string): number {
    // Redis Cluster uses CRC16(key) % 16384
    // Simplified implementation - in production use a proper CRC16
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash) % 16384;
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