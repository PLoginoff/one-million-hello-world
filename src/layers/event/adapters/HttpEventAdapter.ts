/**
 * HTTP Event Adapter
 *
 * HTTP webhook adapter for delivering events to external endpoints.
 * Supports batching, retries, authentication, and multiple endpoint configurations.
 *
 * @module EventLayer/Adapters
 */

import { IEventBus } from '../interfaces/IEventBus';
import { EventHandler, EventConfig, EventStats } from '../types/event-types';

/**
 * HTTP endpoint configuration.
 */
export interface HttpEventEndpoint {
  /** Unique endpoint name */
  name: string;
  /** Target URL */
  url: string;
  /** HTTP method */
  method: 'POST' | 'PUT' | 'PATCH';
  /** Custom headers */
  headers: Record<string, string>;
  /** Authentication configuration */
  auth?: {
    type: 'bearer' | 'basic' | 'api-key' | 'custom';
    credentials: Record<string, string>;
  };
  /** Batch configuration */
  batch?: {
    /** Maximum batch size */
    maxSize: number;
    /** Maximum time to wait for batch (ms) */
    maxWaitMs: number;
  };
  /** Retry configuration */
  retry?: {
    /** Maximum retry attempts */
    maxAttempts: number;
    /** Base delay (ms) */
    baseDelayMs: number;
    /** Maximum delay (ms) */
    maxDelayMs: number;
    /** Exponential backoff */
    exponentialBackoff: boolean;
    /** Retryable status codes */
    retryableStatusCodes: number[];
  };
  /** Timeout for requests (ms) */
  timeoutMs?: number;
  /** Event filter (only send matching events) */
  filter?: (event: string, data: unknown) => boolean;
  /** Transform function for event payload */
  transform?: (event: string, data: unknown) => unknown;
}

/**
 * HTTP adapter configuration.
 */
export interface HttpEventAdapterConfig {
  /** Endpoints to deliver events to */
  endpoints: HttpEventEndpoint[];
  /** Default batch configuration */
  defaultBatch?: {
    maxSize: number;
    maxWaitMs: number;
  };
  /** Default retry configuration */
  defaultRetry?: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    exponentialBackoff: boolean;
    retryableStatusCodes: number[];
  };
  /** Default timeout (ms) */
  defaultTimeoutMs?: number;
  /** User agent string */
  userAgent?: string;
  /** Enable global event buffering */
  enableBuffering?: boolean;
  /** Maximum buffer size */
  maxBufferSize?: number;
}

/**
 * Default HTTP adapter configuration.
 */
export const DEFAULT_HTTP_CONFIG: HttpEventAdapterConfig = {
  endpoints: [],
  defaultBatch: {
    maxSize: 50,
    maxWaitMs: 5000,
  },
  defaultRetry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponentialBackoff: true,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },
  defaultTimeoutMs: 10000,
  userAgent: 'OneMillionHelloWorld/1.0 (Event HTTP Adapter)',
  enableBuffering: true,
  maxBufferSize: 10000,
};

/**
 * Batched event for delivery.
 */
interface BatchedEvent {
  event: string;
  data: unknown;
  timestamp: number;
  endpointName: string;
  attempts: number;
  id: string;
}

/**
 * HTTP Event Adapter implementation.
 * Delivers events to HTTP endpoints with batching, retries, and reliability features.
 */
export class HttpEventAdapter implements IEventBus {
  private readonly _config: HttpEventAdapterConfig;
  private readonly _subscriptions: Map<string, { id: string; event: string; handler: EventHandler<unknown>; once: boolean }>;
  private readonly _eventBuffers: Map<string, BatchedEvent[]>;
  private readonly _batchTimers: Map<string, ReturnType<typeof setTimeout>>;
  private readonly _stats: EventStats;
  private _processing: boolean;
  private _disposed: boolean;

  /**
   * Creates a new HttpEventAdapter.
   *
   * @param config - HTTP adapter configuration
   */
  constructor(config: Partial<HttpEventAdapterConfig> = {}) {
    this._config = { ...DEFAULT_HTTP_CONFIG, ...config };
    this._subscriptions = new Map();
    this._eventBuffers = new Map();
    this._batchTimers = new Map();
    this._stats = {
      publishedCount: 0,
      handledCount: 0,
      errorCount: 0,
      subscriptionCount: 0,
    };
    this._processing = false;
    this._disposed = false;

    // Initialize buffers for each endpoint
    for (const endpoint of this._config.endpoints) {
      this._eventBuffers.set(endpoint.name, []);
    }
  }

  /**
   * @inheritdoc
   */
  subscribe<T>(event: string, handler: EventHandler<T>): string {
    this._checkDisposed();

    const id = `http_sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this._subscriptions.set(id, {
      id,
      event,
      handler: handler as EventHandler<unknown>,
      once: false,
    });
    this._stats.subscriptionCount = this._subscriptions.size;
    return id;
  }

  /**
   * @inheritdoc
   */
  once<T>(event: string, handler: EventHandler<T>): string {
    this._checkDisposed();

    const id = `http_sub_once_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this._subscriptions.set(id, {
      id,
      event,
      handler: handler as EventHandler<unknown>,
      once: true,
    });
    this._stats.subscriptionCount = this._subscriptions.size;
    return id;
  }

  /**
   * @inheritdoc
   */
  unsubscribe(subscriptionId: string): void {
    this._checkDisposed();
    this._subscriptions.delete(subscriptionId);
    this._stats.subscriptionCount = this._subscriptions.size;
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

    this._stats.publishedCount++;

    // Deliver to local subscriptions
    await this._deliverToSubscriptions(event, data);

    // Queue for HTTP endpoints
    if (this._config.enableBuffering) {
      for (const endpoint of this._config.endpoints) {
        if (endpoint.filter && !endpoint.filter(event, data)) continue;
        this._queueEvent(event, data, endpoint);
      }
    } else {
      // Direct delivery
      await Promise.all(
        this._config.endpoints
          .filter((e) => !e.filter || e.filter(event, data))
          .map((endpoint) => this._deliverToEndpoint(endpoint, event, data))
      );
    }
  }

  /**
   * Delivers event to local subscriptions.
   */
  private async _deliverToSubscriptions(event: string, data: unknown): Promise<void> {
    const matching = Array.from(this._subscriptions.values()).filter(
      (s) => s.event === event || s.event === '*' || s.event === '**'
    );

    for (const sub of matching) {
      try {
        await Promise.resolve(sub.handler(data));
        this._stats.handledCount++;
        if (sub.once) {
          this._subscriptions.delete(sub.id);
          this._stats.subscriptionCount = this._subscriptions.size;
        }
      } catch {
        this._stats.errorCount++;
      }
    }
  }

  /**
   * Queues an event for batched delivery.
   */
  private _queueEvent(event: string, data: unknown, endpoint: HttpEventEndpoint): void {
    const buffer = this._eventBuffers.get(endpoint.name) ?? [];
    if (buffer.length >= (this._config.maxBufferSize ?? 10000)) {
      this._stats.errorCount++;
      return;
    }

    const batchedEvent: BatchedEvent = {
      event,
      data,
      timestamp: Date.now(),
      endpointName: endpoint.name,
      attempts: 0,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    };

    buffer.push(batchedEvent);
    this._eventBuffers.set(endpoint.name, buffer);

    const batchConfig = endpoint.batch ?? this._config.defaultBatch!;
    const batchSize = batchConfig.maxSize;
    const batchWaitMs = batchConfig.maxWaitMs;

    if (buffer.length >= batchSize) {
      this._flushEndpointBuffer(endpoint.name);
    } else if (!this._batchTimers.has(endpoint.name)) {
      const timer = setTimeout(() => {
        this._batchTimers.delete(endpoint.name);
        this._flushEndpointBuffer(endpoint.name);
      }, batchWaitMs);
      this._batchTimers.set(endpoint.name, timer);
    }
  }

  /**
   * Flushes the buffer for a specific endpoint.
   */
  private async _flushEndpointBuffer(endpointName: string): Promise<void> {
    const endpoint = this._config.endpoints.find((e) => e.name === endpointName);
    if (!endpoint) return;

    const buffer = this._eventBuffers.get(endpointName) ?? [];
    if (buffer.length === 0) return;

    const batchConfig = endpoint.batch ?? this._config.defaultBatch!;
    const batch = buffer.splice(0, batchConfig.maxSize);
    this._eventBuffers.set(endpointName, buffer);

    await this._deliverBatch(endpoint, batch);
  }

  /**
   * Delivers a batch of events to an endpoint.
   */
  private async _deliverBatch(endpoint: HttpEventEndpoint, batch: BatchedEvent[]): Promise<void> {
    const payload = batch.map((e) => {
      const transformed = endpoint.transform ? endpoint.transform(e.event, e.data) : { event: e.event, data: e.data };
      const base = (transformed && typeof transformed === 'object') ? transformed as Record<string, unknown> : { event: e.event, data: e.data };
      return { ...base, _eventId: e.id, _timestamp: e.timestamp };
    });

    const success = await this._sendWithRetry(endpoint, payload);

    if (success) {
      this._stats.handledCount += batch.length;
    } else {
      // Re-queue failed events for retry
      for (const e of batch) {
        e.attempts++;
        const retryConfig = endpoint.retry ?? this._config.defaultRetry!;
        if (e.attempts < retryConfig.maxAttempts) {
          const buffer = this._eventBuffers.get(endpoint.name) ?? [];
          buffer.unshift(e);
          this._eventBuffers.set(endpoint.name, buffer);
        } else {
          this._stats.errorCount += batch.length;
        }
      }
    }
  }

  /**
   * Delivers a single event to an endpoint (non-batched).
   */
  private async _deliverToEndpoint(endpoint: HttpEventEndpoint, event: string, data: unknown): Promise<void> {
    const transformed = endpoint.transform ? endpoint.transform(event, data) : { event, data };
    const base = (transformed && typeof transformed === 'object') ? transformed as Record<string, unknown> : { event, data };
    const payload = { ...base, _eventId: `evt_${Date.now()}`, _timestamp: Date.now() };

    await this._sendWithRetry(endpoint, [payload]);
  }

  /**
   * Sends a payload with retry logic.
   */
  private async _sendWithRetry(endpoint: HttpEventEndpoint, payload: unknown[]): Promise<boolean> {
    const retryConfig = endpoint.retry ?? this._config.defaultRetry!;
    const maxAttempts = retryConfig.maxAttempts;
    const baseDelay = retryConfig.baseDelayMs;
    const maxDelay = retryConfig.maxDelayMs;
    const exponentialBackoff = retryConfig.exponentialBackoff;
    const retryableStatusCodes = retryConfig.retryableStatusCodes;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this._sendRequest(endpoint, payload);

        if (response.ok) {
          return true;
        }

        // Check if status code is retryable
        if (retryableStatusCodes.includes(response.status)) {
          if (attempt < maxAttempts) {
            const delay = exponentialBackoff
              ? Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
              : baseDelay;
            await this._sleep(delay);
            continue;
          }
        }

        // Non-retryable status or max attempts reached
        return false;
      } catch (error) {
        if (attempt < maxAttempts) {
          const delay = exponentialBackoff
            ? Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
            : baseDelay;
          await this._sleep(delay);
          continue;
        }
        return false;
      }
    }

    return false;
  }

  /**
   * Sends an HTTP request.
   */
  private async _sendRequest(endpoint: HttpEventEndpoint, payload: unknown[]): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': this._config.userAgent!,
      ...endpoint.headers,
    };

    // Add authentication
    if (endpoint.auth) {
      switch (endpoint.auth.type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${endpoint.auth.credentials.token}`;
          break;
        case 'basic':
          const basic = btoa(`${endpoint.auth.credentials.username}:${endpoint.auth.credentials.password}`);
          headers['Authorization'] = `Basic ${basic}`;
          break;
        case 'api-key':
          headers[endpoint.auth.credentials.headerName ?? 'X-API-Key'] = endpoint.auth.credentials.apiKey;
          break;
        case 'custom':
          Object.assign(headers, endpoint.auth.credentials);
          break;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs ?? this._config.defaultTimeoutMs);

    try {
      return await fetch(endpoint.url, {
        method: endpoint.method,
        headers,
        body: JSON.stringify({ events: payload, batch: payload.length > 1 }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Flushes all pending buffers.
   */
  async flush(): Promise<void> {
    for (const endpoint of this._config.endpoints) {
      await this._flushEndpointBuffer(endpoint.name);
    }
  }

  /**
   * Shuts down the adapter gracefully.
   */
  async shutdown(): Promise<void> {
    // Clear all timers
    for (const timer of this._batchTimers.values()) {
      clearTimeout(timer);
    }
    this._batchTimers.clear();

    // Flush all buffers
    await this.flush();
  }

  /**
   * @inheritdoc
   */
  getStats(): EventStats {
    const bufferSizes: Record<string, number> = {};
    for (const [name, buffer] of this._eventBuffers.entries()) {
      bufferSizes[name] = buffer.length;
    }

    return {
      ...this._stats,
      bufferSizes,
    };
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
      enablePersistence: false,
      maxQueueSize: this._config.maxBufferSize ?? 10000,
    };
  }

  /**
   * @inheritdoc
   */
  clear(): void {
    this._subscriptions.clear();
    this._stats.subscriptionCount = 0;
    for (const buffer of this._eventBuffers.values()) {
      buffer.length = 0;
    }
  }

  /**
   * Adds an endpoint dynamically.
   */
  addEndpoint(endpoint: HttpEventEndpoint): void {
    this._config.endpoints.push(endpoint);
    this._eventBuffers.set(endpoint.name, []);
  }

  /**
   * Removes an endpoint.
   */
  removeEndpoint(name: string): boolean {
    const index = this._config.endpoints.findIndex((e) => e.name === name);
    if (index !== -1) {
      this._config.endpoints.splice(index, 1);
      this._eventBuffers.delete(name);
      const timer = this._batchTimers.get(name);
      if (timer) {
        clearTimeout(timer);
        this._batchTimers.delete(name);
      }
      return true;
    }
    return false;
  }

  /**
   * Gets all endpoint names.
   */
  getEndpoints(): string[] {
    return this._config.endpoints.map((e) => e.name);
  }

  /**
   * Gets the current buffer size for an endpoint.
   */
  getBufferSize(endpointName: string): number {
    return this._eventBuffers.get(endpointName)?.length ?? 0;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private _checkDisposed(): void {
    if (this._disposed) {
      throw new Error('HttpEventAdapter has been disposed');
    }
  }

  /**
   * Disposes the adapter.
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    await this.shutdown();
    this.clear();
  }
}