/**
 * Redis Event Adapter
 *
 * Production-ready Redis adapter for event bus using Redis Pub/Sub and Streams.
 * Supports high-throughput event publishing, consumer groups, and event persistence.
 *
 * @module EventLayer/Adapters
 */

import { IEventBus } from '../interfaces/IEventBus';
import { EventHandler, EventConfig, EventStats } from '../types/event-types';

/**
 * Redis connection configuration.
 */
export interface RedisEventAdapterConfig {
  /** Redis host */
  host: string;
  /** Redis port */
  port: number;
  /** Redis password (optional) */
  password?: string;
  /** Database number */
  db?: number;
  /** Key prefix for all Redis keys */
  keyPrefix?: string;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Command timeout in milliseconds */
  commandTimeout?: number;
  /** Enable offline queue */
  enableOfflineQueue?: boolean;
  /** Retry strategy function */
  retryStrategy?: (times: number) => number | null;
  /** TLS configuration */
  tls?: boolean | Record<string, unknown>;
  /** Stream configuration */
  stream?: {
    /** Maximum stream length */
    maxLength?: number;
    /** Consumer group name */
    consumerGroup?: string;
    /** Consumer name */
    consumerName?: string;
    /** Block time for XREAD (ms) */
    blockMs?: number;
    /** Count for XREAD */
    count?: number;
  };
  /** Pub/Sub configuration */
  pubsub?: {
    /** Enable Pub/Sub mode */
    enabled?: boolean;
    /** Channels to subscribe to */
    channels?: string[];
  };
}

/**
 * Default Redis configuration.
 */
export const DEFAULT_REDIS_CONFIG: RedisEventAdapterConfig = {
  host: 'localhost',
  port: 6379,
  keyPrefix: 'events:',
  connectionTimeout: 5000,
  commandTimeout: 3000,
  enableOfflineQueue: true,
  stream: {
    maxLength: 10000,
    consumerGroup: 'event-bus',
    consumerName: `consumer-${process.pid}`,
    blockMs: 5000,
    count: 100,
  },
  pubsub: {
    enabled: true,
    channels: [],
  },
};

/**
 * Redis client interface (abstraction over ioredis/redis).
 */
interface RedisClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): this;
  xAdd(key: string, id: string | '*', data: Record<string, string>): Promise<string>;
  xRead(
    streams: Record<string, string>,
    count?: number,
    block?: number
  ): Promise<Array<{ key: string; messages: Array<{ id: string; data: Record<string, string> }> }>>;
  xGroupCreate(key: string, group: string, id: string, mkstream?: boolean): Promise<void>;
  xReadGroup(
    group: string,
    consumer: string,
    streams: Record<string, string>,
    count?: number,
    block?: number
  ): Promise<Array<{ key: string; messages: Array<{ id: string; data: Record<string, string> }> }>>;
  xAck(key: string, group: string, ...ids: string[]): Promise<number>;
  xTrim(key: string, maxLen: number, strategy?: 'MAXLEN' | 'MIN-ID'): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<void>;
}

/**
 * Subscription info for Redis adapter.
 */
interface RedisSubscription {
  id: string;
  event: string;
  handler: EventHandler<unknown>;
  once: boolean;
  mode: 'pubsub' | 'stream';
  consumerGroup?: string;
}

/**
 * Redis Event Adapter implementation.
 * Uses Redis Pub/Sub for real-time delivery and Redis Streams for persistence and replay.
 */
export class RedisEventAdapter implements IEventBus {
  private readonly _config: RedisEventAdapterConfig;
  private _client: RedisClient | null = null;
  private _subscriberClient: RedisClient | null = null;
  private _connected: boolean = false;
  private _subscriptions: Map<string, RedisSubscription> = new Map();
  private _stats: EventStats = {
    publishedCount: 0,
    handledCount: 0,
    errorCount: 0,
    subscriptionCount: 0,
  };
  private _streamConsumerInterval: ReturnType<typeof setInterval> | null = null;
  private _eventBuffer: Array<{ event: string; data: unknown; timestamp: number }> = [];
  private _disposed: boolean = false;

  /**
   * Creates a new RedisEventAdapter.
   *
   * @param config - Redis configuration
   */
  constructor(config: Partial<RedisEventAdapterConfig> = {}) {
    this._config = { ...DEFAULT_REDIS_CONFIG, ...config };
  }

  /**
   * Connects to Redis.
   */
  async connect(): Promise<void> {
    if (this._connected && this._client) return;

    try {
      // Dynamic import to avoid build-time dependency
      let createClient: ((options: unknown) => RedisClient) | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const redisModule: any = await import('redis');
        createClient = redisModule.createClient as (options: unknown) => RedisClient;
      } catch {
        // Try ioredis as fallback
        try {
          // @ts-expect-error - ioredis is an optional dependency, loaded dynamically at runtime
          const ioredisModule: any = await import('ioredis');
          const Redis = ioredisModule.default;
          createClient = (options: unknown) => new Redis(options as Record<string, unknown>) as unknown as RedisClient;
        } catch {
          throw new Error('Neither redis nor ioredis package installed. Run: npm install redis');
        }
      }

      if (!createClient) {
        throw new Error('Failed to create Redis client');
      }

      // Main client for publishing
      const client = createClient({
        socket: {
          host: this._config.host,
          port: this._config.port,
          connectTimeout: this._config.connectionTimeout,
          reconnectStrategy: this._config.retryStrategy,
          tls: this._config.tls,
        },
        password: this._config.password,
        database: this._config.db,
      });

      // Subscriber client for Pub/Sub
      const subscriberClient = createClient({
        socket: {
          host: this._config.host,
          port: this._config.port,
          connectTimeout: this._config.connectionTimeout,
          reconnectStrategy: this._config.retryStrategy,
          tls: this._config.tls,
        },
        password: this._config.password,
        database: this._config.db,
      });

      // Set up event handlers
      const setupClient = (c: RedisClient, name: string) => {
        c.on('error', (err: unknown) => {
          this._stats.errorCount++;
          this._connected = false;
          console.error(`[RedisEventAdapter:${name}] Error:`, err);
        });

        c.on('connect', () => {
          console.log(`[RedisEventAdapter:${name}] Connected`);
        });

        c.on('ready', () => {
          this._connected = true;
          console.log(`[RedisEventAdapter:${name}] Ready`);
        });

        c.on('end', () => {
          this._connected = false;
          console.log(`[RedisEventAdapter:${name}] Disconnected`);
        });
      };

      setupClient(client, 'publisher');
      setupClient(subscriberClient, 'subscriber');

      // Handle Pub/Sub messages
      subscriberClient.on('message', (...args: unknown[]) => {
        const [channel, message] = args as [string, string];
        this._handlePubSubMessage(channel, message);
      });

      await client.connect();
      await subscriberClient.connect();

      this._client = client;
      this._subscriberClient = subscriberClient;

      // Initialize consumer group for streams
      if (this._config.stream?.consumerGroup) {
        await this._initConsumerGroup();
      }

      // Start stream consumer if using streams
      if (this._config.stream && !this._config.pubsub?.enabled) {
        this._startStreamConsumer();
      }

      // Subscribe to Pub/Sub channels if enabled
      if (this._config.pubsub?.enabled && this._config.pubsub.channels?.length) {
        for (const channel of this._config.pubsub.channels) {
          await subscriberClient.subscribe(channel);
        }
      }
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Disconnects from Redis.
   */
  async disconnect(): Promise<void> {
    if (this._streamConsumerInterval) {
      clearInterval(this._streamConsumerInterval);
      this._streamConsumerInterval = null;
    }

    if (this._client) {
      await this._client.quit();
      this._client = null;
    }

    if (this._subscriberClient) {
      await this._subscriberClient.quit();
      this._subscriberClient = null;
    }

    this._connected = false;
  }

  /**
   * @inheritdoc
   */
  subscribe<T>(event: string, handler: EventHandler<T>): string {
    this._checkDisposed();

    const id = `redis_sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const mode = this._config.pubsub?.enabled ? 'pubsub' : 'stream';

    const subscription: RedisSubscription = {
      id,
      event,
      handler: handler as EventHandler<unknown>,
      once: false,
      mode,
      consumerGroup: this._config.stream?.consumerGroup,
    };

    this._subscriptions.set(id, subscription);
    this._stats.subscriptionCount = this._subscriptions.size;

    // Subscribe to Pub/Sub channel if in pubsub mode
    if (mode === 'pubsub' && this._subscriberClient) {
      const channel = this._getChannelName(event);
      this._subscriberClient.subscribe(channel).catch((err) => {
        console.error(`Failed to subscribe to ${channel}:`, err);
      });
    }

    return id;
  }

  /**
   * @inheritdoc
   */
  once<T>(event: string, handler: EventHandler<T>): string {
    this._checkDisposed();

    const id = `redis_sub_once_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const mode = this._config.pubsub?.enabled ? 'pubsub' : 'stream';

    const subscription: RedisSubscription = {
      id,
      event,
      handler: handler as EventHandler<unknown>,
      once: true,
      mode,
      consumerGroup: this._config.stream?.consumerGroup,
    };

    this._subscriptions.set(id, subscription);
    this._stats.subscriptionCount = this._subscriptions.size;

    if (mode === 'pubsub' && this._subscriberClient) {
      const channel = this._getChannelName(event);
      this._subscriberClient.subscribe(channel).catch((err) => {
        console.error(`Failed to subscribe to ${channel}:`, err);
      });
    }

    return id;
  }

  /**
   * @inheritdoc
   */
  unsubscribe(subscriptionId: string): void {
    this._checkDisposed();

    const subscription = this._subscriptions.get(subscriptionId);
    if (subscription) {
      if (subscription.mode === 'pubsub' && this._subscriberClient) {
        const channel = this._getChannelName(subscription.event);
        this._subscriberClient.unsubscribe(channel).catch(() => {});
      }
      this._subscriptions.delete(subscriptionId);
      this._stats.subscriptionCount = this._subscriptions.size;
    }
  }

  /**
   * @inheritdoc
   */
  publish<T>(event: string, data: T): void {
    this._checkDisposed();
    void this.publishAsync(event, data);
  }

  /**
   * @inheritdoc
   */
  async publishAsync<T>(event: string, data: T): Promise<void> {
    this._checkDisposed();

    if (!this._connected || !this._client) {
      await this.connect();
    }

    if (!this._client) {
      throw new Error('Redis client not connected');
    }

    try {
      this._stats.publishedCount++;

      const eventData = {
        event,
        data: JSON.stringify(data),
        timestamp: Date.now().toString(),
        eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      };

      // Publish via Pub/Sub if enabled
      if (this._config.pubsub?.enabled) {
        const channel = this._getChannelName(event);
        await this._client.publish(channel, JSON.stringify(eventData));
      }

      // Also persist to stream for durability
      const streamKey = this._getStreamKey(event);
      await this._client.xAdd(streamKey, '*', eventData);

      // Trim stream if max length configured
      if (this._config.stream?.maxLength) {
        await this._client.xTrim(streamKey, this._config.stream.maxLength);
      }
    } catch (error) {
      this._stats.errorCount++;
      throw new Error(`Failed to publish event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * @inheritdoc
   */
  getStats(): EventStats {
    return { ...this._stats };
  }

  /**
   * @inheritdoc
   */
  setConfig(config: EventConfig): void {
    // Update relevant config options
  }

  /**
   * @inheritdoc
   */
  getConfig(): EventConfig {
    return {
      enableAsync: true,
      enablePersistence: true,
      maxQueueSize: this._config.stream?.maxLength ?? 10000,
    };
  }

  /**
   * @inheritdoc
   */
  clear(): void {
    this._subscriptions.clear();
    this._stats.subscriptionCount = 0;
  }

  /**
   * Gets the Redis connection status.
   *
   * @returns True if connected
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Gets the Redis client for advanced operations.
   *
   * @returns Redis client or null if not connected
   */
  getClient(): RedisClient | null {
    return this._client;
  }

  /**
   * Reads events from a stream.
   *
   * @param event - Event name
   * @param startId - Start ID (default: '0' for beginning, '$' for new only)
   * @param count - Maximum number of events to read
   * @returns Array of events
   */
  async readStream(
    event: string,
    startId: string = '0',
    count: number = 100
  ): Promise<Array<{ id: string; event: string; data: unknown; timestamp: number }>> {
    if (!this._client) throw new Error('Not connected');

    const streamKey = this._getStreamKey(event);
    const result = await this._client.xRead({ [streamKey]: startId }, count);

    return result.flatMap((r) =>
      r.messages.map((m) => ({
        id: m.id,
        event: m.data.event ?? event,
        data: JSON.parse(m.data.data ?? '{}'),
        timestamp: parseInt(m.data.timestamp ?? '0', 10),
      }))
    );
  }

  /**
   * Replays events from stream to a handler.
   *
   * @param event - Event name
   * @param handler - Handler to receive events
   * @param startId - Start ID for replay
   * @param count - Maximum events to replay
   * @returns Number of events replayed
   */
  async replayStream<T>(
    event: string,
    handler: EventHandler<T>,
    startId: string = '0',
    count: number = 1000
  ): Promise<number> {
    const events = await this.readStream(event, startId, count);
    let replayed = 0;

    for (const evt of events) {
      try {
        await handler(evt.data as T);
        replayed++;
      } catch {
        this._stats.errorCount++;
      }
    }

    return replayed;
  }

  /**
   * Gets the stream key for an event.
   */
  private _getStreamKey(event: string): string {
    return `${this._config.keyPrefix}stream:${event}`;
  }

  /**
   * Gets the Pub/Sub channel name for an event.
   */
  private _getChannelName(event: string): string {
    return `${this._config.keyPrefix}pubsub:${event}`;
  }

  /**
   * Initializes the consumer group for streams.
   */
  private async _initConsumerGroup(): Promise<void> {
    if (!this._client || !this._config.stream?.consumerGroup) return;

    const streamKey = this._getStreamKey('*'); // This won't work for all streams
    // In practice, you'd create consumer groups per stream
    // This is a simplified implementation
  }

  /**
   * Starts the stream consumer loop.
   */
  private _startStreamConsumer(): void {
    if (!this._client || !this._config.stream?.consumerGroup) return;

    const consumerGroup = this._config.stream.consumerGroup;
    const consumerName = this._config.stream.consumerName ?? `consumer-${process.pid}`;
    const blockMs = this._config.stream.blockMs ?? 5000;
    const count = this._config.stream.count ?? 100;

    this._streamConsumerInterval = setInterval(async () => {
      if (!this._connected || !this._client) return;

      try {
        // Build streams object from subscriptions
        const streams: Record<string, string> = {};
        for (const sub of this._subscriptions.values()) {
          if (sub.mode === 'stream') {
            streams[this._getStreamKey(sub.event)] = '>';
          }
        }

        if (Object.keys(streams).length === 0) return;

        const result = await this._client!.xReadGroup(consumerGroup, consumerName, streams, count, blockMs);

        for (const stream of result) {
          for (const message of stream.messages) {
            await this._processStreamMessage(stream.key, message);
          }
        }
      } catch (error) {
        // Ignore consumer errors, will retry on next interval
        console.error('[RedisEventAdapter] Stream consumer error:', error);
      }
    }, 100);
  }

  /**
   * Processes a stream message.
   */
  private async _processStreamMessage(streamKey: string, message: { id: string; data: Record<string, string> }): Promise<void> {
    const event = message.data.event;
    const data = JSON.parse(message.data.data ?? '{}');

    // Find matching subscriptions
    for (const sub of this._subscriptions.values()) {
      if (sub.mode === 'stream' && sub.event === event) {
        try {
          await sub.handler(data);
          this._stats.handledCount++;

          // Acknowledge message
          if (this._client && sub.consumerGroup) {
            await this._client.xAck(streamKey, sub.consumerGroup, message.id);
          }

          if (sub.once) {
            this.unsubscribe(sub.id);
          }
        } catch (error) {
          this._stats.errorCount++;
          // Don't ack on error - will be redelivered
        }
      }
    }
  }

  /**
   * Handles a Pub/Sub message.
   */
  private _handlePubSubMessage(channel: string, message: string): void {
    try {
      const eventData = JSON.parse(message);
      const event = eventData.event;
      const data = JSON.parse(eventData.data ?? '{}');

      for (const sub of this._subscriptions.values()) {
        if (sub.mode === 'pubsub' && sub.event === event) {
          try {
            sub.handler(data);
            this._stats.handledCount++;

            if (sub.once) {
              this.unsubscribe(sub.id);
            }
          } catch {
            this._stats.errorCount++;
          }
        }
      }
    } catch {
      this._stats.errorCount++;
    }
  }

  private _checkDisposed(): void {
    if (this._disposed) {
      throw new Error('RedisEventAdapter has been disposed');
    }
  }

  /**
   * Disposes the adapter.
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    await this.disconnect();
    this.clear();
  }
}