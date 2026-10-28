/**
 * HTTP Audit Adapter
 *
 * Sends Audit events to external HTTP endpoints (SIEM, Splunk, Elastic, custom).
 * Supports batching, retries, and multiple endpoint configurations.
 */

import { IAudit } from '../interfaces/IAudit';
import { AuditEventType, AuditDomainEvent, AuditEventPayload } from '../domain/events/AuditEventTypes';

export interface HttpAuditEndpoint {
  name: string;
  url: string;
  method: 'POST' | 'PUT';
  headers: Record<string, string>;
  batchSize?: number;
  batchTimeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  transform?: (event: AuditDomainEvent) => unknown;
}

export interface HttpAuditAdapterConfig {
  endpoints: HttpAuditEndpoint[];
  defaultBatchSize?: number;
  defaultBatchTimeoutMs?: number;
  defaultRetryAttempts?: number;
  defaultRetryDelayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
}

interface BatchedEvent {
  event: AuditDomainEvent;
  endpointName: string;
  attempts: number;
  timestamp: number;
}

export class HttpAuditAdapter implements IAudit {
  private _config: HttpAuditAdapterConfig;
  private _executionCount: number = 0;
  private _successCount: number = 0;
  private _errorCount: number = 0;
  private _lastError: Error | null = null;
  private _eventQueue: BatchedEvent[] = [];
  private _batchTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _processing: boolean = false;

  constructor(config: HttpAuditAdapterConfig) {
    this._config = {
      defaultBatchSize: 50,
      defaultBatchTimeoutMs: 5000,
      defaultRetryAttempts: 3,
      defaultRetryDelayMs: 1000,
      timeoutMs: 10000,
      userAgent: 'OneMillionHelloWorld/1.0 (Audit Adapter)',
      ...config,
    };
  }

  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    this._executionCount++;

    try {
      const event = this._normalizeEvent(input);

      for (const endpoint of this._config.endpoints) {
        this._queueEvent(event, endpoint.name);
      }

      return Promise.resolve({
        success: true,
        data: {
          adapter: 'http',
          eventId: event.eventId,
          eventType: event.type,
          queuedEndpoints: this._config.endpoints.length,
          executionCount: this._executionCount,
        },
      });
    } catch (error) {
      this._errorCount++;
      this._lastError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve({
        success: false,
        error: {
          code: 'HTTP_ADAPTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config } as HttpAuditAdapterConfig;
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'http',
      layer: 'audit',
      executionCount: this._executionCount,
      successCount: this._successCount,
      errorCount: this._errorCount,
      lastError: this._lastError?.message ?? null,
      queueSize: this._eventQueue.length,
      endpoints: this._config.endpoints.map((e) => ({
        name: e.name,
        url: e.url,
        batchSize: e.batchSize ?? this._config.defaultBatchSize,
      })),
    };
  }

  async flush(): Promise<void> {
    await this._processQueue();
  }

  async shutdown(): Promise<void> {
    for (const timer of this._batchTimers.values()) {
      clearTimeout(timer);
    }
    this._batchTimers.clear();
    await this._processQueue();
  }

  private _normalizeEvent(input: unknown): AuditDomainEvent {
    if (input !== null && typeof input === 'object' && 'type' in input && 'payload' in input) {
      const event = input as Partial<AuditDomainEvent>;
      return {
        type: event.type as AuditEventType,
        payload: event.payload as AuditEventPayload,
        timestamp: event.timestamp ?? Date.now(),
        source: event.source ?? 'audit-adapter',
        eventId: event.eventId ?? this._generateEventId(),
        correlationId: event.correlationId,
      };
    }

    return {
      type: AuditEventType.CUSTOM_EVENT,
      payload: { eventName: 'unknown', payload: input as Record<string, unknown> },
      timestamp: Date.now(),
      source: 'audit-adapter',
      eventId: this._generateEventId(),
    };
  }

  private _queueEvent(event: AuditDomainEvent, endpointName: string): void {
    const batchedEvent: BatchedEvent = {
      event,
      endpointName,
      attempts: 0,
      timestamp: Date.now(),
    };

    this._eventQueue.push(batchedEvent);

    const endpoint = this._config.endpoints.find((e) => e.name === endpointName);
    const batchSize = endpoint?.batchSize ?? this._config.defaultBatchSize!;
    const batchTimeout = endpoint?.batchTimeoutMs ?? this._config.defaultBatchTimeoutMs!;

    if (this._getQueueSizeForEndpoint(endpointName) >= batchSize) {
      void this._processEndpointQueue(endpointName);
    } else if (!this._batchTimers.has(endpointName)) {
      const timer = setTimeout(() => {
        this._batchTimers.delete(endpointName);
        void this._processEndpointQueue(endpointName);
      }, batchTimeout);
      this._batchTimers.set(endpointName, timer);
    }
  }

  private _getQueueSizeForEndpoint(endpointName: string): number {
    return this._eventQueue.filter((e) => e.endpointName === endpointName).length;
  }

  private async _processQueue(): Promise<void> {
    if (this._processing) return;
    this._processing = true;

    const endpointNames = [...new Set(this._eventQueue.map((e) => e.endpointName))];

    for (const endpointName of endpointNames) {
      await this._processEndpointQueue(endpointName);
    }

    this._processing = false;
  }

  private async _processEndpointQueue(endpointName: string): Promise<void> {
    const endpoint = this._config.endpoints.find((e) => e.name === endpointName);
    if (!endpoint) return;

    const batchSize = endpoint.batchSize ?? this._config.defaultBatchSize!;
    const events = this._eventQueue.filter((e) => e.endpointName === endpointName).slice(0, batchSize);

    if (events.length === 0) return;

    const payload = events.map((e) => {
      const transformed = endpoint.transform ? endpoint.transform(e.event) : e.event;
      return transformed;
    });

    const success = await this._sendWithRetry(endpoint, payload);

    if (success) {
      this._eventQueue = this._eventQueue.filter((e) => !events.includes(e));
      this._successCount += events.length;
    } else {
      for (const e of events) {
        e.attempts++;
        const maxAttempts = endpoint.retryAttempts ?? this._config.defaultRetryAttempts!;
        if (e.attempts >= maxAttempts) {
          this._errorCount++;
          this._lastError = new Error(`Max retry attempts reached for endpoint ${endpointName}`);
        }
      }
    }
  }

  private async _sendWithRetry(endpoint: HttpAuditEndpoint, payload: unknown[]): Promise<boolean> {
    const maxAttempts = endpoint.retryAttempts ?? this._config.defaultRetryAttempts!;
    const baseDelay = endpoint.retryDelayMs ?? this._config.defaultRetryDelayMs!;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this._config.userAgent!,
            ...endpoint.headers,
          },
          body: JSON.stringify({ events: payload, batch: true }),
          signal: AbortSignal.timeout(this._config.timeoutMs!),
        });

        if (response.ok) {
          return true;
        }

        if (response.status >= 500 || response.status === 429) {
          if (attempt < maxAttempts) {
            await this._sleep(baseDelay * Math.pow(2, attempt - 1));
            continue;
          }
        }

        return false;
      } catch (error) {
        if (attempt < maxAttempts) {
          await this._sleep(baseDelay * Math.pow(2, attempt - 1));
          continue;
        }
        this._lastError = error instanceof Error ? error : new Error(String(error));
        return false;
      }
    }

    return false;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private _generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
