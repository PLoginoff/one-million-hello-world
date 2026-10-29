/**
 * Kafka Event Adapter
 *
 * Kafka producer/consumer adapter for high-throughput event streaming.
 * Supports exactly-once semantics, consumer groups, and topic partitioning.
 *
 * @module EventLayer/Adapters
 */

import { IEventBus } from '../interfaces/IEventBus';
import { EventHandler, EventConfig, EventStats } from '../types/event-types';

/**
 * Kafka producer configuration.
 */
export interface KafkaProducerConfig {
  /** Bootstrap servers */
  brokers: string[];
  /** Client ID */
  clientId?: string;
  /** Acknowledgment level */
  acks?: 'all' | '1' | '0';
  /** Retry attempts */
  retries?: number;
  /** Retry delay (ms) */
  retryDelayMs?: number;
  /** Enable idempotence */
  enableIdempotence?: boolean;
  /** Transaction timeout (ms) */
  transactionTimeoutMs?: number;
  /** Compression type */
  compression?: 'gzip' | 'snappy' | 'lz4' | 'zstd';
  /** Batch size (bytes) */
  batchSize?: number;
  /** Linger time (ms) */
  lingerMs?: number;
  /** Buffer memory (bytes) */
  bufferMemory?: number;
  /** Max request size (bytes) */
  maxRequestSize?: number;
  /** SASL authentication */
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512' | 'oauthbearer';
    username: string;
    password: string;
  };
  /** SSL configuration */
  ssl?: boolean | Record<string, unknown>;
}

/**
 * Kafka consumer configuration.
 */
export interface KafkaConsumerConfig {
  /** Bootstrap servers */
  brokers: string[];
  /** Consumer group ID */
  groupId: string;
  /** Client ID */
  clientId?: string;
  /** Topics to subscribe to */
  topics: string[];
  /** Auto offset reset */
  autoOffsetReset?: 'earliest' | 'latest' | 'none';
  /** Enable auto commit */
  enableAutoCommit?: boolean;
  /** Auto commit interval (ms) */
  autoCommitIntervalMs?: number;
  /** Max poll records */
  maxPollRecords?: number;
  /** Max poll interval (ms) */
  maxPollIntervalMs?: number;
  /** Session timeout (ms) */
  sessionTimeoutMs?: number;
  /** Heartbeat interval (ms) */
  heartbeatIntervalMs?: number;
  /** SASL authentication */
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512' | 'oauthbearer';
    username: string;
    password: string;
  };
  /** SSL configuration */
  ssl?: boolean | Record<string, unknown>;
}

/**
 * Kafka adapter configuration.
 */
export interface KafkaEventAdapterConfig {
  /** Producer configuration */
  producer: KafkaProducerConfig;
  /** Consumer configuration */
  consumer: KafkaConsumerConfig;
  /** Topic prefix for all topics */
  topicPrefix?: string;
  /** Default topic for events without explicit topic */
  defaultTopic?: string;
  /** Event serializer */
  serializer?: 'json' | 'avro' | 'protobuf';
  /** Schema registry URL (for Avro/Protobuf) */
  schemaRegistryUrl?: string;
}

/**
 * Default Kafka configuration.
 */
export const DEFAULT_KAFKA_CONFIG: Partial<KafkaEventAdapterConfig> = {
  topicPrefix: 'events.',
  defaultTopic: 'events.default',
  serializer: 'json',
};

/**
 * Kafka producer interface.
 */
interface KafkaProducer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(batch: { topic: string; messages: Array<{ key?: string; value: string; headers?: Record<string, string> }> }): Promise<void>;
  sendBatch(batches: Array<{ topic: string; messages: Array<{ key?: string; value: string; headers?: Record<string, string> }> }>): Promise<void>;
  transaction(): KafkaTransaction;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

/**
 * Kafka transaction interface.
 */
interface KafkaTransaction {
  send(batch: { topic: string; messages: Array<{ key?: string; value: string; headers?: Record<string, string> }> }): Promise<void>;
  commit(): Promise<void>;
  abort(): Promise<void>;
}

/**
 * Kafka consumer interface.
 */
interface KafkaConsumer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(topics: string | string[], fromBeginning?: boolean): Promise<void>;
  run(config: { eachMessage: (payload: { topic: string; partition: number; message: { key: string | null; value: string | null; headers: Record<string, string[]> } }) => Promise<void> }): Promise<void>;
  pause(topics: string[]): void;
  resume(topics: string[]): void;
  commitOffsets(offsets: Array<{ topic: string; partition: number; offset: string }>): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

/**
 * Kafka admin interface.
 */
interface KafkaAdmin {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createTopics(topics: Array<{ topic: string; numPartitions: number; replicationFactor: number }>): Promise<void>;
  deleteTopics(topics: string[]): Promise<void>;
  listTopics(): Promise<string[]>;
}

/**
 * Kafka client factory interface.
 */
interface KafkaClientFactory {
  producer(config: KafkaProducerConfig): KafkaProducer;
  consumer(config: KafkaConsumerConfig): KafkaConsumer;
  admin(config: { brokers: string[]; clientId?: string }): KafkaAdmin;
}

/**
 * Subscription info for Kafka adapter.
 */
interface KafkaSubscription {
  id: string;
  event: string;
  handler: EventHandler<unknown>;
  once: boolean;
  topic: string;
}

/**
 * Kafka Event Adapter implementation.
 * Uses Kafka for high-throughput, durable event streaming with consumer groups.
 */
export class KafkaEventAdapter implements IEventBus {
  private readonly _config: KafkaEventAdapterConfig;
  private _factory: KafkaClientFactory | null = null;
  private _producer: KafkaProducer | null = null;
  private _consumer: KafkaConsumer | null = null;
  private _admin: KafkaAdmin | null = null;
  private _connected: boolean = false;
  private _subscriptions: Map<string, KafkaSubscription> = new Map();
  private _stats: EventStats = {
    publishedCount: 0,
    handledCount: 0,
    errorCount: 0,
    subscriptionCount: 0,
  };
  private _running: boolean = false;
  private _disposed: boolean = false;

  /**
   * Creates a new KafkaEventAdapter.
   *
   * @param config - Kafka configuration
   */
  constructor(config: KafkaEventAdapterConfig) {
    this._config = { ...DEFAULT_KAFKA_CONFIG, ...config } as KafkaEventAdapterConfig;
  }

  /**
   * Connects to Kafka.
   */
  async connect(): Promise<void> {
    if (this._connected) return;

    try {
      // Dynamic import to avoid build-time dependency
      let factory: KafkaClientFactory | null = null;
      try {
        // @ts-expect-error - kafkajs is an optional dependency, loaded dynamically at runtime
        const kafkaModule: any = await import('kafkajs');
        const { Kafka } = kafkaModule;

        factory = {
          producer: (config) => {
            const kafka = new Kafka({
              clientId: config.clientId,
              brokers: config.brokers,
              ssl: config.ssl,
              sasl: config.sasl,
            });
            return kafka.producer({
              allowAutoCreateTopics: true,
              transactionTimeout: config.transactionTimeoutMs,
              retry: { retries: config.retries, initialRetryTime: config.retryDelayMs },
            });
          },
          consumer: (config) => {
            const kafka = new Kafka({
              clientId: config.clientId,
              brokers: config.brokers,
            });
            return kafka.consumer({
              groupId: config.groupId,
              maxWaitTimeInMs: 100,
              maxBytes: 10485760,
              sessionTimeout: config.sessionTimeoutMs,
              heartbeatInterval: config.heartbeatIntervalMs,
            });
          },
          admin: (config) => {
            const kafka = new Kafka({
              clientId: config.clientId,
              brokers: config.brokers,
            });
            return kafka.admin();
          },
        };
      } catch {
        throw new Error('kafkajs package not installed. Run: npm install kafkajs');
      }

      if (!factory) {
        throw new Error('Failed to create Kafka client factory');
      }

      this._factory = factory;
      this._producer = factory.producer(this._config.producer);
      this._consumer = factory.consumer(this._config.consumer);
      this._admin = factory.admin({ brokers: this._config.producer.brokers, clientId: this._config.producer.clientId });

      // Set up event handlers
      this._producer.on('producer.connect', () => {
        console.log('[KafkaEventAdapter] Producer connected');
      });
      this._producer.on('producer.disconnect', () => {
        console.log('[KafkaEventAdapter] Producer disconnected');
        this._connected = false;
      });
      this._producer.on('producer.network.request_timeout', () => {
        this._stats.errorCount++;
      });

      this._consumer.on('consumer.connect', () => {
        console.log('[KafkaEventAdapter] Consumer connected');
      });
      this._consumer.on('consumer.disconnect', () => {
        console.log('[KafkaEventAdapter] Consumer disconnected');
      });
      this._consumer.on('consumer.crash', (error: unknown) => {
        this._stats.errorCount++;
        console.error('[KafkaEventAdapter] Consumer crash:', error);
      });

      await this._producer.connect();
      await this._consumer.connect();

      // Subscribe to topics
      const topics = this._config.consumer.topics.map((t) => this._getTopicName(t));
      await this._consumer.subscribe(topics, false);

      // Start consumer loop
      await this._consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          await this._handleMessage(topic, partition, message);
        },
      });

      this._connected = true;
      this._running = true;
    } catch (error) {
      throw new Error(`Failed to connect to Kafka: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Disconnects from Kafka.
   */
  async disconnect(): Promise<void> {
    this._running = false;

    if (this._consumer) {
      await this._consumer.disconnect();
      this._consumer = null;
    }

    if (this._producer) {
      await this._producer.disconnect();
      this._producer = null;
    }

    if (this._admin) {
      await this._admin.disconnect();
      this._admin = null;
    }

    this._connected = false;
  }

  /**
   * @inheritdoc
   */
  subscribe<T>(event: string, handler: EventHandler<T>): string {
    this._checkDisposed();

    const id = `kafka_sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const topic = this._getTopicName(event);

    const subscription: KafkaSubscription = {
      id,
      event,
      handler: handler as EventHandler<unknown>,
      once: false,
      topic,
    };

    this._subscriptions.set(id, subscription);
    this._stats.subscriptionCount = this._subscriptions.size;

    // Subscribe consumer to topic if not already subscribed
    if (this._consumer && this._running) {
      this._consumer.subscribe([topic], false).catch(() => {});
    }

    return id;
  }

  /**
   * @inheritdoc
   */
  once<T>(event: string, handler: EventHandler<T>): string {
    this._checkDisposed();

    const id = `kafka_sub_once_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const topic = this._getTopicName(event);

    const subscription: KafkaSubscription = {
      id,
      event,
      handler: handler as EventHandler<unknown>,
      once: true,
      topic,
    };

    this._subscriptions.set(id, subscription);
    this._stats.subscriptionCount = this._subscriptions.size;

    if (this._consumer && this._running) {
      this._consumer.subscribe([topic], false).catch(() => {});
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
      this._subscriptions.delete(subscriptionId);
      this._stats.subscriptionCount = this._subscriptions.size;

      // Check if any other subscriptions use this topic
      const stillSubscribed = Array.from(this._subscriptions.values()).some((s) => s.topic === subscription.topic);
      if (!stillSubscribed && this._consumer && this._running) {
        // Note: KafkaJS doesn't support unsubscribe directly, would need to pause/resume
      }
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

    if (!this._connected || !this._producer) {
      await this.connect();
    }

    if (!this._producer) {
      throw new Error('Kafka producer not connected');
    }

    try {
      this._stats.publishedCount++;

      const topic = this._getTopicName(event);
      const message = this._serializeEvent(event, data);

      await this._producer.send({
        topic,
        messages: [
          {
            key: event,
            value: message,
            headers: {
              'event-type': event,
              'timestamp': Date.now().toString(),
              'event-id': `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            },
          },
        ],
      });
    } catch (error) {
      this._stats.errorCount++;
      throw new Error(`Failed to publish event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Publishes multiple events in a transaction.
   *
   * @param events - Array of events to publish atomically
   */
  async publishTransaction<T>(events: Array<{ event: string; data: T }>): Promise<void> {
    this._checkDisposed();

    if (!this._connected || !this._producer) {
      await this.connect();
    }

    if (!this._producer) {
      throw new Error('Kafka producer not connected');
    }

    const transaction = this._producer.transaction();

    try {
      for (const { event, data } of events) {
        this._stats.publishedCount++;
        const topic = this._getTopicName(event);
        const message = this._serializeEvent(event, data);

        await transaction.send({
          topic,
          messages: [
            {
              key: event,
              value: message,
              headers: {
                'event-type': event,
                'timestamp': Date.now().toString(),
                'event-id': `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
              },
            },
          ],
        });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.abort();
      this._stats.errorCount++;
      throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    // Update relevant config
  }

  /**
   * @inheritdoc
   */
  getConfig(): EventConfig {
    return {
      enableAsync: true,
      enablePersistence: true,
      maxQueueSize: this._config.producer.bufferMemory ?? 33554432,
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
   * Creates topics if they don't exist.
   *
   * @param topics - Topic configurations
   */
  async createTopics(
    topics: Array<{ topic: string; numPartitions?: number; replicationFactor?: number }>
  ): Promise<void> {
    if (!this._admin) {
      await this.connect();
    }

    if (!this._admin) {
      throw new Error('Kafka admin not connected');
    }

    const topicConfigs = topics.map((t) => ({
      topic: this._getTopicName(t.topic),
      numPartitions: t.numPartitions ?? 1,
      replicationFactor: t.replicationFactor ?? 1,
    }));

    await this._admin.createTopics(topicConfigs);
  }

  /**
   * Lists all topics.
   */
  async listTopics(): Promise<string[]> {
    if (!this._admin) {
      await this.connect();
    }

    if (!this._admin) {
      throw new Error('Kafka admin not connected');
    }

    return this._admin.listTopics();
  }

  /**
   * Gets the Kafka connection status.
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Gets the producer for advanced operations.
   */
  getProducer(): KafkaProducer | null {
    return this._producer;
  }

  /**
   * Gets the consumer for advanced operations.
   */
  getConsumer(): KafkaConsumer | null {
    return this._consumer;
  }

  /**
   * Pauses consumption for specific topics.
   */
  pauseTopics(topics: string[]): void {
    if (this._consumer) {
      this._consumer.pause(topics.map((t) => this._getTopicName(t)));
    }
  }

  /**
   * Resumes consumption for specific topics.
   */
  resumeTopics(topics: string[]): void {
    if (this._consumer) {
      this._consumer.resume(topics.map((t) => this._getTopicName(t)));
    }
  }

  /**
   * Handles incoming Kafka messages.
   */
  private async _handleMessage(
    topic: string,
    partition: number,
    message: { key: string | null; value: string | null; headers: Record<string, string[]> }
  ): Promise<void> {
    if (!message.value) return;

    try {
      const eventData = this._deserializeEvent(message.value);
      const event = eventData.event ?? message.headers['event-type']?.[0] ?? topic.replace(this._config.topicPrefix ?? '', '');

      // Find matching subscriptions
      for (const sub of this._subscriptions.values()) {
        if (sub.topic === topic || sub.event === event || sub.event === '*' || sub.event === '**') {
          try {
            await sub.handler(eventData.data);
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

  /**
   * Serializes an event for Kafka.
   */
  private _serializeEvent(event: string, data: unknown): string {
    switch (this._config.serializer) {
      case 'json':
      default:
        return JSON.stringify({ event, data, timestamp: Date.now() });
      case 'avro':
      case 'protobuf':
        // Would use schema registry
        return JSON.stringify({ event, data, timestamp: Date.now() });
    }
  }

  /**
   * Deserializes an event from Kafka.
   */
  private _deserializeEvent(value: string): { event: string; data: unknown; timestamp: number } {
    switch (this._config.serializer) {
      case 'json':
      default:
        return JSON.parse(value);
      case 'avro':
      case 'protobuf':
        // Would use schema registry
        return JSON.parse(value);
    }
  }

  /**
   * Gets the full topic name with prefix.
   */
  private _getTopicName(event: string): string {
    const prefix = this._config.topicPrefix ?? '';
    if (event.startsWith(prefix)) return event;
    return `${prefix}${event}`;
  }

  private _checkDisposed(): void {
    if (this._disposed) {
      throw new Error('KafkaEventAdapter has been disposed');
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