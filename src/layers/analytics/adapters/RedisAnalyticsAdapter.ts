/**
 * Redis Analytics Adapter
 *
 * Production-ready Redis adapter for analytics event storage and aggregation.
 * Uses Redis Streams for event persistence and Redis Hash/Sorted Sets for aggregations.
 */

import { IAnalyticsAdapter } from './InMemoryAdapter';
import { AnalyticsEventType, AnalyticsDomainEvent, AnalyticsEventPayload } from '../domain/events/AnalyticsEventTypes';

export interface RedisAnalyticsAdapterConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  streamMaxLength?: number;
  connectionTimeout?: number;
  commandTimeout?: number;
  enableOfflineQueue?: boolean;
  retryStrategy?: (times: number) => number | null;
  tls?: boolean;
}

interface RedisClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  xAdd(key: string, id: string, data: Record<string, string>): Promise<string>;
  xRead(
    streams: Record<string, string>,
    count?: number,
    block?: number
  ): Promise<Array<{ key: string; messages: Array<{ id: string; data: Record<string, string> }> }>>;
  hIncrBy(key: string, field: string, increment: number): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  zIncrBy(key: string, increment: number, member: string): Promise<number>;
  zRange(key: string, start: number, stop: number, rev?: boolean): Promise<string[]>;
  zScore(key: string, member: string): Promise<string | null>;
  expire(key: string, seconds: number): Promise<number>;
  eval(script: string, numKeys: number, ...keys: string[]): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

export class RedisAnalyticsAdapter implements IAnalyticsAdapter {
  private _config: RedisAnalyticsAdapterConfig;
  private _client: RedisClient | null = null;
  private _connected: boolean = false;
  private _executionCount: number = 0;
  private _errorCount: number = 0;
  private _lastError: Error | null = null;
  private _eventBuffer: AnalyticsDomainEvent[] = [];
  private _flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly _bufferSize: number = 100;
  private readonly _flushIntervalMs: number = 5000;

  constructor(config: RedisAnalyticsAdapterConfig) {
    this._config = {
      keyPrefix: 'analytics:',
      streamMaxLength: 10000,
      connectionTimeout: 5000,
      commandTimeout: 3000,
      enableOfflineQueue: true,
      ...config,
    };
  }

  async connect(): Promise<void> {
    if (this._connected && this._client) return;

    try {
      // Dynamic import to avoid build-time dependency
      let createClient: ((options: unknown) => RedisClient) | null = null;
      try {
        const redisModule = await import('redis');
        createClient = redisModule.createClient as (options: unknown) => RedisClient;
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
        password: this._config.password,
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
        this._startFlushInterval();
      });

      client.on('end', () => {
        this._connected = false;
        this._stopFlushInterval();
      });

      await client.connect();
      this._client = client;
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<void> {
    this._stopFlushInterval();
    await this._flushBuffer();
    if (this._client) {
      await this._client.disconnect();
      this._client = null;
    }
    this._connected = false;
  }

  async execute(
    input: unknown
  ): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    this._executionCount++;

    if (!this._connected || !this._client) {
      await this.connect();
    }

    try {
      const event = this._normalizeEvent(input);
      await this._persistEvent(event);
      await this._updateAggregations(event);

      return {
        success: true,
        data: {
          adapter: 'redis',
          eventId: event.eventId,
          eventType: event.type,
          timestamp: event.timestamp,
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

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config } as RedisAnalyticsAdapterConfig;
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'redis',
      layer: 'analytics',
      connected: this._connected,
      executionCount: this._executionCount,
      errorCount: this._errorCount,
      lastError: this._lastError?.message ?? null,
      bufferSize: this._eventBuffer.length,
      config: {
        host: this._config.host,
        port: this._config.port,
        db: this._config.db,
        keyPrefix: this._config.keyPrefix,
      },
    };
  }

  async getEventStream(
    eventType: AnalyticsEventType,
    startId: string = '0',
    count: number = 100
  ): Promise<AnalyticsDomainEvent[]> {
    if (!this._client) throw new Error('Not connected');
    const streamKey = `${this._config.keyPrefix}events:${eventType}`;
    const result = await this._client.xRead({ [streamKey]: startId }, count);
    return result.flatMap((r) => r.messages.map((m) => this._deserializeEvent(m.data)));
  }

  async getAggregation(metricName: string, startTime: number, endTime: number): Promise<Record<string, number>> {
    if (!this._client) throw new Error('Not connected');
    const key = `${this._config.keyPrefix}aggregations:${metricName}`;
    const members = await this._client.zRange(key, 0, -1);
    const result: Record<string, number> = {};
    for (const member of members) {
      const score = await this._client.zScore(key, member);
      if (score !== null && score !== undefined) {
        const timestamp = parseInt(member.split(':')[1] || '0', 10);
        if (timestamp >= startTime && timestamp <= endTime) {
          result[member] = parseFloat(score);
        }
      }
    }
    return result;
  }

  async getTopEvents(
    eventType: AnalyticsEventType,
    limit: number = 10
  ): Promise<Array<{ event: string; count: number }>> {
    if (!this._client) throw new Error('Not connected');
    const key = `${this._config.keyPrefix}top_events:${eventType}`;
    const members = await this._client.zRange(key, 0, limit - 1, true);
    const result: Array<{ event: string; count: number }> = [];
    for (const member of members) {
      const score = await this._client.zScore(key, member);
      if (score !== null && score !== undefined) {
        result.push({ event: member, count: parseFloat(score) });
      }
    }
    return result;
  }

  private _normalizeEvent(input: unknown): AnalyticsDomainEvent {
    if (input !== null && typeof input === 'object' && 'type' in input && 'payload' in input) {
      const event = input as Partial<AnalyticsDomainEvent>;
      return {
        type: event.type as AnalyticsEventType,
        payload: event.payload as AnalyticsEventPayload,
        timestamp: event.timestamp ?? Date.now(),
        source: event.source ?? 'analytics-adapter',
        eventId: event.eventId ?? this._generateEventId(),
        correlationId: event.correlationId,
      };
    }

    return {
      type: AnalyticsEventType.CUSTOM_EVENT,
      payload: { eventName: 'unknown', payload: input as Record<string, unknown> },
      timestamp: Date.now(),
      source: 'analytics-adapter',
      eventId: this._generateEventId(),
    };
  }

  private async _persistEvent(event: AnalyticsDomainEvent): Promise<void> {
    if (!this._client) throw new Error('Client not initialized');

    const streamKey = `${this._config.keyPrefix}events:${event.type}`;
    const data = {
      eventId: event.eventId,
      type: event.type,
      payload: JSON.stringify(event.payload),
      timestamp: event.timestamp.toString(),
      source: event.source,
      correlationId: event.correlationId ?? '',
    };

    await this._client.xAdd(streamKey, '*', data);

    if (this._config.streamMaxLength !== undefined && this._config.streamMaxLength > 0) {
      // Use MAXLEN option correctly for redis v4+
      await this._client.xAdd(streamKey, '*', { ...data, MAXLEN: '~', COUNT: this._config.streamMaxLength.toString() });
    }
  }

  private async _updateAggregations(event: AnalyticsDomainEvent): Promise<void> {
    if (!this._client) return;

    const prefix = this._config.keyPrefix!;
    const minuteBucket = Math.floor(event.timestamp / 60000) * 60000;
    const hourBucket = Math.floor(event.timestamp / 3600000) * 3600000;

    const pipelineOps: Array<() => Promise<void>> = [];

    pipelineOps.push(async () => {
      await this._client!.hIncrBy(`${prefix}counts:by_type`, event.type, 1);
    });

    pipelineOps.push(async () => {
      await this._client!.hIncrBy(`${prefix}counts:by_source`, event.source, 1);
    });

    pipelineOps.push(async () => {
      await this._client!.zIncrBy(`${prefix}events_per_minute`, 1, `${event.type}:${minuteBucket}`);
    });

    pipelineOps.push(async () => {
      await this._client!.zIncrBy(`${prefix}events_per_hour`, 1, `${event.type}:${hourBucket}`);
    });

    if (event.type === AnalyticsEventType.PAGE_VIEW) {
      const payload = event.payload as { url?: string };
      if (payload.url !== undefined && payload.url !== '') {
        pipelineOps.push(async () => {
          await this._client!.zIncrBy(`${prefix}top_pages`, 1, payload.url!);
        });
      }
    }

    if (event.type === AnalyticsEventType.CONVERSION) {
      const payload = event.payload as { conversionName?: string; value?: number };
      if (payload.conversionName !== undefined && payload.conversionName !== '') {
        pipelineOps.push(async () => {
          await this._client!.zIncrBy(`${prefix}conversions`, payload.value ?? 1, payload.conversionName!);
        });
      }
    }

    for (const op of pipelineOps) {
      try {
        await op();
      } catch {
        // Ignore aggregation errors
      }
    }
  }

  private _startFlushInterval(): void {
    this._flushInterval = setInterval(() => {
      this._flushBuffer().catch(() => {});
    }, this._flushIntervalMs);
  }

  private _stopFlushInterval(): void {
    if (this._flushInterval) {
      clearInterval(this._flushInterval);
      this._flushInterval = null;
    }
  }

  private async _flushBuffer(): Promise<void> {
    if (this._eventBuffer.length === 0 || !this._client) return;

    const events = this._eventBuffer.splice(0, this._bufferSize);
    for (const event of events) {
      try {
        await this._persistEvent(event);
        await this._updateAggregations(event);
      } catch {
        // Re-add to buffer on failure
        this._eventBuffer.unshift(event);
      }
    }
  }

  private _deserializeEvent(data: Record<string, string>): AnalyticsDomainEvent {
    const payload = JSON.parse(data.payload) as AnalyticsEventPayload;
    return {
      eventId: data.eventId,
      type: data.type as AnalyticsEventType,
      payload,
      timestamp: parseInt(data.timestamp, 10),
      source: data.source,
      correlationId: data.correlationId || undefined,
    };
  }

  private _generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
