/**
 * Redis ApiGateway Adapter
 *
 * Production-ready Redis adapter for API Gateway event storage and metrics.
 * Uses Redis Streams for event persistence and Redis Hash/Sorted Sets for metrics.
 */

import { IApiGatewayAdapter } from '../adapters/InMemoryAdapter';
import {
  ApiGatewayEventType,
  ApiGatewayDomainEvent,
  ApiGatewayEventPayload,
} from '../domain/events/ApiGatewayEventTypes';

export interface RedisApiGatewayAdapterConfig {
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

export class RedisApiGatewayAdapter implements IApiGatewayAdapter {
  private _config: RedisApiGatewayAdapterConfig;
  private _client: RedisClient | null = null;
  private _connected: boolean = false;
  private _executionCount: number = 0;
  private _errorCount: number = 0;
  private _lastError: Error | null = null;
  private _eventBuffer: ApiGatewayDomainEvent[] = [];
  private _flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly _bufferSize: number = 100;
  private readonly _flushIntervalMs: number = 5000;

  constructor(config: RedisApiGatewayAdapterConfig) {
    this._config = {
      keyPrefix: 'api_gateway:',
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
      await this._updateMetrics(event);

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
    this._config = { ...this._config, ...config } as RedisApiGatewayAdapterConfig;
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'redis',
      layer: 'api_gateway',
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
    eventType: ApiGatewayEventType,
    startId: string = '0',
    count: number = 100
  ): Promise<ApiGatewayDomainEvent[]> {
    if (!this._client) throw new Error('Not connected');
    const streamKey = `${this._config.keyPrefix}events:${eventType}`;
    const result = await this._client.xRead({ [streamKey]: startId }, count);
    return result.flatMap((r) => r.messages.map((m) => this._deserializeEvent(m.data)));
  }

  async getMetrics(metricName: string, startTime: number, endTime: number): Promise<Record<string, number>> {
    if (!this._client) throw new Error('Not connected');
    const key = `${this._config.keyPrefix}metrics:${metricName}`;
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

  async getTopRoutes(limit: number = 10): Promise<Array<{ route: string; count: number }>> {
    if (!this._client) throw new Error('Not connected');
    const key = `${this._config.keyPrefix}top_routes`;
    const members = await this._client.zRange(key, 0, limit - 1, true);
    const result: Array<{ route: string; count: number }> = [];
    for (const member of members) {
      const score = await this._client.zScore(key, member);
      if (score !== null && score !== undefined) {
        result.push({ route: member, count: parseFloat(score) });
      }
    }
    return result;
  }

  async getErrorRates(startTime: number, endTime: number): Promise<Record<string, number>> {
    if (!this._client) throw new Error('Not connected');
    const key = `${this._config.keyPrefix}error_rates`;
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

  private _normalizeEvent(input: unknown): ApiGatewayDomainEvent {
    if (input !== null && typeof input === 'object' && 'type' in input && 'payload' in input) {
      const event = input as Partial<ApiGatewayDomainEvent>;
      return {
        type: event.type as ApiGatewayEventType,
        payload: event.payload as ApiGatewayEventPayload,
        timestamp: event.timestamp ?? Date.now(),
        source: event.source ?? 'api_gateway-adapter',
        eventId: event.eventId ?? this._generateEventId(),
        correlationId: event.correlationId,
      };
    }

    return {
      type: ApiGatewayEventType.CUSTOM_EVENT,
      payload: { eventName: 'unknown', payload: input as Record<string, unknown> },
      timestamp: Date.now(),
      source: 'api_gateway-adapter',
      eventId: this._generateEventId(),
    };
  }

  private async _persistEvent(event: ApiGatewayDomainEvent): Promise<void> {
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
      await this._client.xAdd(streamKey, '*', { ...data, MAXLEN: '~', COUNT: this._config.streamMaxLength.toString() });
    }
  }

  private async _updateMetrics(event: ApiGatewayDomainEvent): Promise<void> {
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

    if (event.type === ApiGatewayEventType.REQUEST_RECEIVED) {
      const payload = event.payload as { routeId?: string; serviceName?: string };
      if (payload.routeId !== undefined && payload.routeId !== '') {
        pipelineOps.push(async () => {
          await this._client!.zIncrBy(`${prefix}top_routes`, 1, payload.routeId!);
        });
      }
      if (payload.serviceName !== undefined && payload.serviceName !== '') {
        pipelineOps.push(async () => {
          await this._client!.hIncrBy(`${prefix}requests:by_service`, payload.serviceName!, 1);
        });
      }
    }

    if (event.type === ApiGatewayEventType.RATE_LIMIT_EXCEEDED) {
      const payload = event.payload as { scope?: string };
      if (payload.scope !== undefined && payload.scope !== '') {
        pipelineOps.push(async () => {
          await this._client!.zIncrBy(`${prefix}rate_limit_exceeded`, 1, `${payload.scope}:${minuteBucket}`);
        });
      }
    }

    if (event.type === ApiGatewayEventType.AUTH_FAILED) {
      const payload = event.payload as { authType?: string; reason?: string };
      if (payload.authType !== undefined && payload.authType !== '') {
        pipelineOps.push(async () => {
          await this._client!.hIncrBy(`${prefix}auth_failures:by_type`, payload.authType!, 1);
        });
      }
      if (payload.reason !== undefined && payload.reason !== '') {
        pipelineOps.push(async () => {
          await this._client!.hIncrBy(`${prefix}auth_failures:by_reason`, payload.reason!, 1);
        });
      }
    }

    if (event.type === ApiGatewayEventType.CIRCUIT_BREAKER_OPEN) {
      const payload = event.payload as { serviceName?: string };
      if (payload.serviceName !== undefined && payload.serviceName !== '') {
        pipelineOps.push(async () => {
          await this._client!.zIncrBy(
            `${prefix}circuit_breaker_events`,
            1,
            `${payload.serviceName}:open:${minuteBucket}`
          );
        });
      }
    }

    if (event.type === ApiGatewayEventType.RESPONSE_RECEIVED) {
      const payload = event.payload as { statusCode?: number; cacheHit?: boolean; upstreamService?: string };
      const statusCode = payload.statusCode;
      if (statusCode !== undefined && statusCode !== null) {
        pipelineOps.push(async () => {
          await this._client!.hIncrBy(`${prefix}responses:by_status`, statusCode.toString(), 1);
        });
      }
      if (payload.cacheHit !== undefined) {
        pipelineOps.push(async () => {
          await this._client!.hIncrBy(`${prefix}cache_hits`, payload.cacheHit === true ? 'hit' : 'miss', 1);
        });
      }
      if (payload.upstreamService !== undefined && payload.upstreamService !== '') {
        pipelineOps.push(async () => {
          await this._client!.hIncrBy(`${prefix}responses:by_service`, payload.upstreamService!, 1);
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
        await this._updateMetrics(event);
      } catch {
        this._eventBuffer.unshift(event);
      }
    }
  }

  private _deserializeEvent(data: Record<string, string>): ApiGatewayDomainEvent {
    const payload = JSON.parse(data.payload) as ApiGatewayEventPayload;
    return {
      eventId: data.eventId,
      type: data.type as ApiGatewayEventType,
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
