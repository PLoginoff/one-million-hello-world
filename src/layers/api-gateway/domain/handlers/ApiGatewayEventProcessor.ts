/**
 * ApiGateway Event Processor
 *
 * Real business logic for processing API Gateway events.
 * Handles request routing, rate limiting, circuit breaker, auth, metrics.
 */

import { IApiGatewayAdapter } from '../../adapters/InMemoryAdapter';
import {
  ApiGatewayEventType,
  ApiGatewayDomainEvent,
  ApiGatewayEventPayload,
  RequestReceivedPayload,
  RequestRoutedPayload,
  RequestForwardedPayload,
  ResponseReceivedPayload,
  ResponseSentPayload,
  RateLimitExceededPayload,
  AuthFailedPayload,
  CircuitBreakerPayload,
  ServiceDiscoveryPayload,
  HealthCheckPayload,
} from '../events/ApiGatewayEventTypes';

export interface ApiGatewayProcessorConfig {
  enableValidation: boolean;
  enableEnrichment: boolean;
  enableRateLimitTracking: boolean;
  enableCircuitBreakerTracking: boolean;
  enableAuthTracking: boolean;
  enableServiceDiscoveryTracking: boolean;
  enableHealthCheckTracking: boolean;
  maxEventSize: number;
  allowedEventTypes: ApiGatewayEventType[];
  piiFields: string[];
}

export interface EnrichedEvent extends ApiGatewayDomainEvent {
  enriched: boolean;
  requestId?: string;
  serviceName?: string;
  routeId?: string;
  clientIp?: string;
  userId?: string;
  processingTimeMs: number;
}

export interface RouteMetrics {
  routeId: string;
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  lastRequestAt: number;
}

export interface ServiceMetrics {
  serviceName: string;
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number;
  healthyInstances: number;
  totalInstances: number;
  circuitBreakerState: 'closed' | 'open' | 'half_open';
  lastHealthCheck: number;
}

export interface RateLimitMetrics {
  scope: string;
  identifier: string;
  currentCount: number;
  limit: number;
  windowMs: number;
  blockedCount: number;
  lastBlockedAt?: number;
}

export interface AuthMetrics {
  authType: string;
  totalAttempts: number;
  failedAttempts: number;
  failuresByReason: Record<string, number>;
  lastFailureAt?: number;
}

export class ApiGatewayEventProcessor {
  private _config: ApiGatewayProcessorConfig;
  private _adapters: Map<string, IApiGatewayAdapter>;
  private _routeMetrics: Map<string, RouteMetrics>;
  private _serviceMetrics: Map<string, ServiceMetrics>;
  private _rateLimitMetrics: Map<string, RateLimitMetrics>;
  private _authMetrics: Map<string, AuthMetrics>;
  private _circuitBreakers: Map<string, CircuitBreakerPayload>;
  private _serviceInstances: Map<string, Map<string, ServiceDiscoveryPayload>>;
  private _latencySamples: Map<string, number[]>;
  private _eventCounts: Map<string, number>;
  private _errorCounts: Map<string, number>;
  private _processingTimes: number[];
  private _startTime: number;

  constructor(config: Partial<ApiGatewayProcessorConfig> = {}) {
    this._config = {
      enableValidation: true,
      enableEnrichment: true,
      enableRateLimitTracking: true,
      enableCircuitBreakerTracking: true,
      enableAuthTracking: true,
      enableServiceDiscoveryTracking: true,
      enableHealthCheckTracking: true,
      maxEventSize: 1024 * 1024,
      allowedEventTypes: Object.values(ApiGatewayEventType),
      piiFields: ['authorization', 'cookie', 'x-api-key', 'x-auth-token', 'password', 'secret', 'token'],
      ...config,
    };

    this._adapters = new Map();
    this._routeMetrics = new Map();
    this._serviceMetrics = new Map();
    this._rateLimitMetrics = new Map();
    this._authMetrics = new Map();
    this._circuitBreakers = new Map();
    this._serviceInstances = new Map();
    this._latencySamples = new Map();
    this._eventCounts = new Map();
    this._errorCounts = new Map();
    this._processingTimes = [];
    this._startTime = Date.now();

    this._startCleanupInterval();
  }

  registerAdapter(name: string, adapter: IApiGatewayAdapter): void {
    this._adapters.set(name, adapter);
  }

  unregisterAdapter(name: string): void {
    this._adapters.delete(name);
  }

  async processEvent(event: ApiGatewayDomainEvent): Promise<EnrichedEvent> {
    const startTime = Date.now();

    try {
      const validatedEvent = this._validateEvent(event);
      const enrichedEvent = this._enrichEvent(validatedEvent);
      await this._routeEvent(enrichedEvent);
      this._updateMetrics(enrichedEvent);

      const processingTime = Date.now() - startTime;
      this._recordProcessingTime(processingTime);
      this._incrementEventCount(enrichedEvent.type);

      return { ...enrichedEvent, processingTimeMs: processingTime };
    } catch (error) {
      this._incrementErrorCount(event.type);
      throw error;
    }
  }

  async processBatch(events: ApiGatewayDomainEvent[]): Promise<EnrichedEvent[]> {
    const results: EnrichedEvent[] = [];
    for (const event of events) {
      try {
        const result = await this.processEvent(event);
        results.push(result);
      } catch (error) {
        this._incrementErrorCount(event.type);
        results.push({
          ...event,
          enriched: false,
          processingTimeMs: 0,
        } as EnrichedEvent);
      }
    }
    return results;
  }

  getRouteMetrics(routeId: string): RouteMetrics | undefined {
    return this._routeMetrics.get(routeId);
  }

  getAllRouteMetrics(): RouteMetrics[] {
    return Array.from(this._routeMetrics.values());
  }

  getServiceMetrics(serviceName: string): ServiceMetrics | undefined {
    return this._serviceMetrics.get(serviceName);
  }

  getAllServiceMetrics(): ServiceMetrics[] {
    return Array.from(this._serviceMetrics.values());
  }

  getRateLimitMetrics(scope: string, identifier: string): RateLimitMetrics | undefined {
    return this._rateLimitMetrics.get(`${scope}:${identifier}`);
  }

  getAuthMetrics(authType: string): AuthMetrics | undefined {
    return this._authMetrics.get(authType);
  }

  getCircuitBreakerState(serviceName: string): CircuitBreakerPayload | undefined {
    return this._circuitBreakers.get(serviceName);
  }

  getServiceInstances(serviceName: string): ServiceDiscoveryPayload[] {
    const instances = this._serviceInstances.get(serviceName);
    return instances ? Array.from(instances.values()) : [];
  }

  getEventCounts(): Record<string, number> {
    return Object.fromEntries(this._eventCounts);
  }

  getErrorCounts(): Record<string, number> {
    return Object.fromEntries(this._errorCounts);
  }

  getAverageProcessingTime(): number {
    if (this._processingTimes.length === 0) return 0;
    const sum = this._processingTimes.reduce((a, b) => a + b, 0);
    return sum / this._processingTimes.length;
  }

  getUptime(): number {
    return Date.now() - this._startTime;
  }

  getAdapterStatus(): Record<string, Record<string, unknown>> {
    const status: Record<string, Record<string, unknown>> = {};
    for (const [name, adapter] of this._adapters) {
      status[name] = adapter.getStatus();
    }
    return status;
  }

  private _validateEvent(event: ApiGatewayDomainEvent): ApiGatewayDomainEvent {
    if (!this._config.enableValidation) return event;

    if (!this._config.allowedEventTypes.includes(event.type)) {
      throw new Error(`Event type not allowed: ${event.type}`);
    }

    if (event.payload === null || event.payload === undefined || typeof event.payload !== 'object') {
      throw new Error('Event payload is required and must be an object');
    }

    const eventSize = JSON.stringify(event).length;
    if (eventSize > this._config.maxEventSize) {
      throw new Error(`Event size exceeds maximum: ${eventSize} > ${this._config.maxEventSize}`);
    }

    this._sanitizePii(event.payload);

    return event;
  }

  private _sanitizePii(payload: ApiGatewayEventPayload): void {
    const sanitize = (obj: unknown, path: string = ''): void => {
      if (obj === null || obj === undefined || typeof obj !== 'object') return;
      const record = obj as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        const fullPath = path ? `${path}.${key}` : key;
        if (this._config.piiFields.some((pii) => fullPath.toLowerCase().includes(pii.toLowerCase()))) {
          record[key] = '[REDACTED]';
        } else {
          const value = record[key];
          if (value !== null && value !== undefined && typeof value === 'object') {
            sanitize(value, fullPath);
          }
        }
      }
    };
    sanitize(payload);
  }

  private _enrichEvent(event: ApiGatewayDomainEvent): EnrichedEvent {
    if (!this._config.enableEnrichment) {
      return { ...event, enriched: false, processingTimeMs: 0 };
    }

    const enriched: EnrichedEvent = {
      ...event,
      enriched: true,
      processingTimeMs: 0,
    };

    const payload = event.payload;

    switch (event.type) {
      case ApiGatewayEventType.REQUEST_RECEIVED: {
        const req = payload as RequestReceivedPayload;
        enriched.requestId = req.requestId;
        enriched.routeId = req.routeId;
        enriched.serviceName = req.serviceName;
        enriched.clientIp = req.clientIp;
        break;
      }
      case ApiGatewayEventType.REQUEST_ROUTED: {
        const routed = payload as RequestRoutedPayload;
        enriched.requestId = routed.requestId;
        enriched.routeId = routed.routeId;
        enriched.serviceName = routed.serviceName;
        break;
      }
      case ApiGatewayEventType.REQUEST_FORWARDED: {
        const fwd = payload as RequestForwardedPayload;
        enriched.requestId = fwd.requestId;
        break;
      }
      case ApiGatewayEventType.RESPONSE_RECEIVED: {
        const resp = payload as ResponseReceivedPayload;
        enriched.requestId = resp.requestId;
        break;
      }
      case ApiGatewayEventType.RESPONSE_SENT: {
        const sent = payload as ResponseSentPayload;
        enriched.requestId = sent.requestId;
        break;
      }
      case ApiGatewayEventType.RATE_LIMIT_EXCEEDED: {
        const rl = payload as RateLimitExceededPayload;
        enriched.requestId = rl.requestId;
        break;
      }
      case ApiGatewayEventType.AUTH_FAILED: {
        const auth = payload as AuthFailedPayload;
        enriched.requestId = auth.requestId;
        enriched.userId = auth.userId;
        break;
      }
      case ApiGatewayEventType.CIRCUIT_BREAKER_OPEN:
      case ApiGatewayEventType.CIRCUIT_BREAKER_CLOSED: {
        const cb = payload as CircuitBreakerPayload;
        enriched.serviceName = cb.serviceName;
        break;
      }
      case ApiGatewayEventType.SERVICE_DISCOVERY_CHANGED: {
        const sd = payload as ServiceDiscoveryPayload;
        enriched.serviceName = sd.serviceName;
        break;
      }
      case ApiGatewayEventType.HEALTH_CHECK_FAILED:
      case ApiGatewayEventType.HEALTH_CHECK_RECOVERED: {
        const hc = payload as HealthCheckPayload;
        enriched.serviceName = hc.serviceName;
        break;
      }
    }

    return enriched;
  }

  private async _routeEvent(event: EnrichedEvent): Promise<void> {
    for (const [name, adapter] of this._adapters) {
      try {
        await adapter.execute(event);
      } catch (error) {
        console.error(`Adapter ${name} failed:`, error);
      }
    }
  }

  private _updateMetrics(event: EnrichedEvent): void {
    switch (event.type) {
      case ApiGatewayEventType.REQUEST_RECEIVED: {
        const req = event.payload as RequestReceivedPayload;
        if (req.routeId !== undefined && req.routeId !== '') {
          this._updateRouteMetrics(req.routeId, req.serviceName, 0, false);
        }
        break;
      }
      case ApiGatewayEventType.REQUEST_ROUTED: {
        const routed = event.payload as RequestRoutedPayload;
        if (routed.routeId !== undefined && routed.routeId !== '') {
          this._updateRouteMetrics(routed.routeId, routed.serviceName, routed.latencyMs, false);
        }
        break;
      }
      case ApiGatewayEventType.REQUEST_FORWARDED: {
        // const fwd = event.payload as RequestForwardedPayload;
        break;
      }
      case ApiGatewayEventType.RESPONSE_RECEIVED: {
        const resp = event.payload as ResponseReceivedPayload;
        if (event.requestId !== undefined && event.requestId !== '') {
          this._recordLatency(event.requestId, resp.responseTimeMs);
        }
        if (resp.upstreamService !== undefined && resp.upstreamService !== '') {
          this._updateServiceMetrics(resp.upstreamService, resp.statusCode >= 400, resp.responseTimeMs);
        }
        break;
      }
      case ApiGatewayEventType.RESPONSE_SENT: {
        const sent = event.payload as ResponseSentPayload;
        if (event.requestId !== undefined && event.requestId !== '') {
          this._recordLatency(event.requestId, sent.totalLatencyMs);
        }
        break;
      }
      case ApiGatewayEventType.RATE_LIMIT_EXCEEDED: {
        if (this._config.enableRateLimitTracking) {
          const rl = event.payload as RateLimitExceededPayload;
          this._updateRateLimitMetrics(rl.scope, rl.identifier, rl.limit, rl.windowMs);
        }
        break;
      }
      case ApiGatewayEventType.AUTH_FAILED: {
        if (this._config.enableAuthTracking) {
          const auth = event.payload as AuthFailedPayload;
          this._updateAuthMetrics(auth.authType, auth.reason);
        }
        break;
      }
      case ApiGatewayEventType.CIRCUIT_BREAKER_OPEN: {
        if (this._config.enableCircuitBreakerTracking) {
          const cb = event.payload as CircuitBreakerPayload;
          this._updateCircuitBreaker(
            cb.serviceName,
            cb.endpoint,
            'open',
            cb.failureCount,
            cb.threshold,
            cb.nextAttemptMs
          );
        }
        break;
      }
      case ApiGatewayEventType.CIRCUIT_BREAKER_CLOSED: {
        if (this._config.enableCircuitBreakerTracking) {
          const cb = event.payload as CircuitBreakerPayload;
          this._updateCircuitBreaker(cb.serviceName, cb.endpoint, 'closed', cb.failureCount, cb.threshold);
        }
        break;
      }
      case ApiGatewayEventType.SERVICE_DISCOVERY_CHANGED: {
        if (this._config.enableServiceDiscoveryTracking) {
          const sd = event.payload as ServiceDiscoveryPayload;
          this._updateServiceDiscovery(sd);
        }
        break;
      }
      case ApiGatewayEventType.HEALTH_CHECK_FAILED: {
        if (this._config.enableHealthCheckTracking) {
          const hc = event.payload as HealthCheckPayload;
          this._updateHealthCheck(
            hc.serviceName,
            hc.endpoint,
            hc.checkType,
            'unhealthy',
            hc.latencyMs,
            hc.consecutiveFailures
          );
        }
        break;
      }
      case ApiGatewayEventType.HEALTH_CHECK_RECOVERED: {
        if (this._config.enableHealthCheckTracking) {
          const hc = event.payload as HealthCheckPayload;
          this._updateHealthCheck(hc.serviceName, hc.endpoint, hc.checkType, 'healthy', hc.latencyMs, 0);
        }
        break;
      }
    }
  }

  private _updateRouteMetrics(
    routeId: string,
    serviceName: string | undefined,
    latencyMs: number,
    isError: boolean
  ): void {
    let metrics = this._routeMetrics.get(routeId);
    if (!metrics) {
      metrics = {
        routeId,
        requestCount: 0,
        errorCount: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        lastRequestAt: 0,
      };
      this._routeMetrics.set(routeId, metrics);
    }

    metrics.requestCount++;
    if (isError) metrics.errorCount++;
    metrics.lastRequestAt = Date.now();

    if (latencyMs > 0) {
      const samples = this._latencySamples.get(routeId) ?? [];
      samples.push(latencyMs);
      if (samples.length > 1000) samples.shift();
      this._latencySamples.set(routeId, samples);

      const sorted = [...samples].sort((a, b) => a - b);
      metrics.avgLatencyMs = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      metrics.p50LatencyMs = sorted[Math.floor(sorted.length * 0.5)];
      metrics.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)];
      metrics.p99LatencyMs = sorted[Math.floor(sorted.length * 0.99)];
    }
  }

  private _updateServiceMetrics(serviceName: string, isError: boolean, latencyMs: number): void {
    let metrics = this._serviceMetrics.get(serviceName);
    if (!metrics) {
      metrics = {
        serviceName,
        requestCount: 0,
        errorCount: 0,
        avgLatencyMs: 0,
        healthyInstances: 0,
        totalInstances: 0,
        circuitBreakerState: 'closed',
        lastHealthCheck: 0,
      };
      this._serviceMetrics.set(serviceName, metrics);
    }

    metrics.requestCount++;
    if (isError) metrics.errorCount++;
    metrics.lastHealthCheck = Date.now();

    if (latencyMs > 0) {
      const samples = this._latencySamples.get(serviceName) ?? [];
      samples.push(latencyMs);
      if (samples.length > 1000) samples.shift();
      this._latencySamples.set(serviceName, samples);

      metrics.avgLatencyMs = samples.reduce((a, b) => a + b, 0) / samples.length;
    }
  }

  private _recordLatency(requestId: string, latencyMs: number): void {
    const samples = this._latencySamples.get(requestId) ?? [];
    samples.push(latencyMs);
    if (samples.length > 100) samples.shift();
    this._latencySamples.set(requestId, samples);
  }

  private _updateRateLimitMetrics(scope: string, identifier: string, limit: number, windowMs: number): void {
    const key = `${scope}:${identifier}`;
    let metrics = this._rateLimitMetrics.get(key);
    if (!metrics) {
      metrics = {
        scope,
        identifier,
        currentCount: 0,
        limit,
        windowMs,
        blockedCount: 0,
      };
      this._rateLimitMetrics.set(key, metrics);
    }

    metrics.currentCount++;
    metrics.blockedCount++;
    metrics.lastBlockedAt = Date.now();
  }

  private _updateAuthMetrics(authType: string, reason: string): void {
    let metrics = this._authMetrics.get(authType);
    if (!metrics) {
      metrics = {
        authType,
        totalAttempts: 0,
        failedAttempts: 0,
        failuresByReason: {},
      };
      this._authMetrics.set(authType, metrics);
    }

    metrics.totalAttempts++;
    metrics.failedAttempts++;
    metrics.failuresByReason[reason] = (metrics.failuresByReason[reason] ?? 0) + 1;
    metrics.lastFailureAt = Date.now();
  }

  private _updateCircuitBreaker(
    serviceName: string,
    endpoint: string,
    state: 'open' | 'half_open' | 'closed',
    failureCount: number,
    threshold: number,
    nextAttemptMs?: number
  ): void {
    const key = `${serviceName}:${endpoint}`;
    const cb: CircuitBreakerPayload = {
      serviceName,
      endpoint,
      failureCount,
      successCount: state === 'closed' ? 1 : 0,
      threshold,
      state,
      nextAttemptMs,
    };
    this._circuitBreakers.set(key, cb);

    const serviceMetrics = this._serviceMetrics.get(serviceName);
    if (serviceMetrics) {
      serviceMetrics.circuitBreakerState = state;
    }
  }

  private _updateServiceDiscovery(payload: ServiceDiscoveryPayload): void {
    let instances = this._serviceInstances.get(payload.serviceName);
    if (!instances) {
      instances = new Map();
      this._serviceInstances.set(payload.serviceName, instances);
    }

    if (
      payload.eventType === 'registered' ||
      payload.eventType === 'health_changed' ||
      payload.eventType === 'metadata_changed'
    ) {
      instances.set(payload.instanceId, payload);
    } else if (payload.eventType === 'deregistered') {
      instances.delete(payload.instanceId);
    }

    const serviceMetrics = this._serviceMetrics.get(payload.serviceName);
    if (serviceMetrics) {
      serviceMetrics.totalInstances = instances.size;
      serviceMetrics.healthyInstances = Array.from(instances.values()).filter((i) => i.healthy).length;
    }
  }

  private _updateHealthCheck(
    serviceName: string,
    _endpoint: string,
    _checkType: string,
    result: 'healthy' | 'unhealthy' | 'degraded',
    _latencyMs: number,
    _consecutiveFailures: number
  ): void {
    const serviceMetrics = this._serviceMetrics.get(serviceName);
    if (serviceMetrics) {
      serviceMetrics.lastHealthCheck = Date.now();
      if (result === 'unhealthy') {
        serviceMetrics.circuitBreakerState = 'open';
      } else if (result === 'healthy' && serviceMetrics.circuitBreakerState === 'open') {
        serviceMetrics.circuitBreakerState = 'half_open';
      }
    }
  }

  private _incrementEventCount(type: ApiGatewayEventType): void {
    const current = this._eventCounts.get(type) ?? 0;
    this._eventCounts.set(type, current + 1);
  }

  private _incrementErrorCount(type: ApiGatewayEventType): void {
    const current = this._errorCounts.get(type) ?? 0;
    this._errorCounts.set(type, current + 1);
  }

  private _recordProcessingTime(time: number): void {
    this._processingTimes.push(time);
    if (this._processingTimes.length > 1000) {
      this._processingTimes.shift();
    }
  }

  private _startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, metrics] of this._rateLimitMetrics) {
        if (now - (metrics.lastBlockedAt ?? 0) > metrics.windowMs * 2) {
          this._rateLimitMetrics.delete(key);
        }
      }
      for (const [key, samples] of this._latencySamples) {
        if (samples.length === 0) {
          this._latencySamples.delete(key);
        }
      }
    }, 60000);
  }
}
