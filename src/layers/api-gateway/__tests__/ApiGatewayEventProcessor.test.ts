/**
 * ApiGateway Event Processor Tests
 */

import { ApiGatewayEventProcessor } from '../domain/handlers/ApiGatewayEventProcessor';
import { ApiGatewayInMemoryAdapter } from '../adapters/InMemoryAdapter';
import {
  ApiGatewayEventType,
  RequestReceivedPayload,
  RequestRoutedPayload,
  ResponseReceivedPayload,
  RateLimitExceededPayload,
  AuthFailedPayload,
  CircuitBreakerPayload,
  ServiceDiscoveryPayload,
  HealthCheckPayload,
} from '../domain/events/ApiGatewayEventTypes';

describe('ApiGatewayEventProcessor', () => {
  let processor: ApiGatewayEventProcessor;
  let adapter: ApiGatewayInMemoryAdapter;

  beforeEach(() => {
    processor = new ApiGatewayEventProcessor({
      enableValidation: true,
      enableEnrichment: true,
      enableRateLimitTracking: true,
      enableCircuitBreakerTracking: true,
      enableAuthTracking: true,
      enableServiceDiscoveryTracking: true,
      enableHealthCheckTracking: true,
    });
    adapter = new ApiGatewayInMemoryAdapter();
    processor.registerAdapter('inmemory', adapter);
  });

  afterEach(async () => {
    await adapter.clearResponses();
  });

  describe('processEvent', () => {
    it('should process a request received event', async () => {
      const event = {
        type: ApiGatewayEventType.REQUEST_RECEIVED,
        payload: {
          requestId: 'req_123',
          method: 'GET',
          path: '/api/users',
          queryParams: { page: '1' },
          headers: { 'user-agent': 'test' },
          clientIp: '192.168.1.1',
          timestamp: Date.now(),
          serviceName: 'user-service',
          routeId: 'route_users',
        } as RequestReceivedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_123',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(ApiGatewayEventType.REQUEST_RECEIVED);
      expect(result.requestId).toBe('req_123');
      expect(result.routeId).toBe('route_users');
      expect(result.serviceName).toBe('user-service');
      expect(result.clientIp).toBe('192.168.1.1');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should process a request routed event', async () => {
      const event = {
        type: ApiGatewayEventType.REQUEST_ROUTED,
        payload: {
          requestId: 'req_123',
          routeId: 'route_users',
          serviceName: 'user-service',
          targetUrl: 'http://user-service:3000/api/users',
          routingRule: 'prefix:/api/users',
          latencyMs: 5,
        } as RequestRoutedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_124',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.requestId).toBe('req_123');
      expect(result.routeId).toBe('route_users');
      expect(result.serviceName).toBe('user-service');
    });

    it('should process a response received event', async () => {
      const event = {
        type: ApiGatewayEventType.RESPONSE_RECEIVED,
        payload: {
          requestId: 'req_123',
          statusCode: 200,
          responseTimeMs: 45,
          responseSize: 1024,
          cacheHit: false,
          upstreamService: 'user-service',
        } as ResponseReceivedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_125',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.requestId).toBe('req_123');
    });

    it('should track rate limit exceeded events', async () => {
      const event = {
        type: ApiGatewayEventType.RATE_LIMIT_EXCEEDED,
        payload: {
          requestId: 'req_123',
          identifier: 'user_456',
          limit: 100,
          windowMs: 60000,
          currentCount: 101,
          retryAfterMs: 30000,
          scope: 'user',
        } as RateLimitExceededPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_126',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.requestId).toBe('req_123');

      const rlMetrics = processor.getRateLimitMetrics('user', 'user_456');
      expect(rlMetrics).toBeDefined();
      expect(rlMetrics?.blockedCount).toBe(1);
    });

    it('should track auth failed events', async () => {
      const event = {
        type: ApiGatewayEventType.AUTH_FAILED,
        payload: {
          requestId: 'req_123',
          authType: 'jwt',
          reason: 'expired_token',
          clientIp: '192.168.1.1',
          userId: 'user_456',
        } as AuthFailedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_127',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.requestId).toBe('req_123');
      expect(result.userId).toBe('user_456');

      const authMetrics = processor.getAuthMetrics('jwt');
      expect(authMetrics).toBeDefined();
      expect(authMetrics?.failedAttempts).toBe(1);
      expect(authMetrics?.failuresByReason.expired_token).toBe(1);
    });

    it('should track circuit breaker open events', async () => {
      const event = {
        type: ApiGatewayEventType.CIRCUIT_BREAKER_OPEN,
        payload: {
          serviceName: 'payment-service',
          endpoint: '/api/payments',
          failureCount: 10,
          successCount: 0,
          threshold: 5,
          state: 'open',
          nextAttemptMs: Date.now() + 30000,
        } as CircuitBreakerPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_128',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.serviceName).toBe('payment-service');

      const cbState = processor.getCircuitBreakerState('payment-service:/api/payments');
      expect(cbState).toBeDefined();
      expect(cbState?.state).toBe('open');
    });

    it('should track service discovery events', async () => {
      const event = {
        type: ApiGatewayEventType.SERVICE_DISCOVERY_CHANGED,
        payload: {
          serviceName: 'notification-service',
          eventType: 'registered',
          instanceId: 'inst_1',
          endpoints: ['http://notification-1:3000'],
          metadata: { version: '1.2.0' },
          healthy: true,
        } as ServiceDiscoveryPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_129',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.serviceName).toBe('notification-service');

      const instances = processor.getServiceInstances('notification-service');
      expect(instances).toHaveLength(1);
      expect(instances[0].instanceId).toBe('inst_1');
    });

    it('should track health check events', async () => {
      const event = {
        type: ApiGatewayEventType.HEALTH_CHECK_FAILED,
        payload: {
          serviceName: 'order-service',
          endpoint: '/health',
          checkType: 'liveness',
          result: 'unhealthy',
          latencyMs: 5000,
          consecutiveFailures: 3,
        } as HealthCheckPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_130',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.serviceName).toBe('order-service');
    });

    it('should reject disallowed event types', async () => {
      const restrictedProcessor = new ApiGatewayEventProcessor({
        allowedEventTypes: [ApiGatewayEventType.REQUEST_RECEIVED],
      });

      const event = {
        type: ApiGatewayEventType.CIRCUIT_BREAKER_OPEN,
        payload: {
          serviceName: 'test',
          endpoint: '/test',
          failureCount: 1,
          successCount: 0,
          threshold: 5,
          state: 'open',
        } as CircuitBreakerPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_131',
      };

      await expect(restrictedProcessor.processEvent(event)).rejects.toThrow('Event type not allowed');
    });

    it('should sanitize PII fields', async () => {
      const event = {
        type: ApiGatewayEventType.REQUEST_RECEIVED,
        payload: {
          requestId: 'req_123',
          method: 'POST',
          path: '/api/login',
          queryParams: {},
          headers: { authorization: 'Bearer secret_token', cookie: 'session=abc' },
          clientIp: '192.168.1.1',
          timestamp: Date.now(),
        } as RequestReceivedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_132',
      };

      const result = await processor.processEvent(event);
      expect(result.payload.headers.authorization).toBe('[REDACTED]');
      expect(result.payload.headers.cookie).toBe('[REDACTED]');
    });
  });

  describe('processBatch', () => {
    it('should process multiple events', async () => {
      const events = [
        {
          type: ApiGatewayEventType.REQUEST_RECEIVED,
          payload: { requestId: 'req_1', method: 'GET', path: '/api/1', queryParams: {}, headers: {}, clientIp: '1.1.1.1', timestamp: Date.now() } as RequestReceivedPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_1',
        },
        {
          type: ApiGatewayEventType.REQUEST_RECEIVED,
          payload: { requestId: 'req_2', method: 'GET', path: '/api/2', queryParams: {}, headers: {}, clientIp: '2.2.2.2', timestamp: Date.now() } as RequestReceivedPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_2',
        },
        {
          type: ApiGatewayEventType.RESPONSE_RECEIVED,
          payload: { requestId: 'req_1', statusCode: 200, responseTimeMs: 50, responseSize: 512, cacheHit: true, upstreamService: 'service-a' } as ResponseReceivedPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_3',
        },
      ];

      const results = await processor.processBatch(events);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.enriched)).toBe(true);
    });
  });

  describe('metrics', () => {
    it('should track route metrics', async () => {
      await processor.processEvent({
        type: ApiGatewayEventType.REQUEST_ROUTED,
        payload: { requestId: 'req_1', routeId: 'route_a', serviceName: 'service_a', targetUrl: 'http://a', routingRule: 'prefix:/a', latencyMs: 10 } as RequestRoutedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: ApiGatewayEventType.RESPONSE_RECEIVED,
        payload: { requestId: 'req_1', statusCode: 200, responseTimeMs: 50, responseSize: 100, cacheHit: false, upstreamService: 'service_a' } as ResponseReceivedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const routeMetrics = processor.getRouteMetrics('route_a');
      expect(routeMetrics).toBeDefined();
      expect(routeMetrics?.requestCount).toBe(1);
      expect(routeMetrics?.avgLatencyMs).toBeGreaterThan(0);
    });

    it('should track service metrics', async () => {
      await processor.processEvent({
        type: ApiGatewayEventType.RESPONSE_RECEIVED,
        payload: { requestId: 'req_1', statusCode: 200, responseTimeMs: 30, responseSize: 200, cacheHit: false, upstreamService: 'service_b' } as ResponseReceivedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      const serviceMetrics = processor.getServiceMetrics('service_b');
      expect(serviceMetrics).toBeDefined();
      expect(serviceMetrics?.requestCount).toBe(1);
    });

    it('should track event counts', async () => {
      await processor.processEvent({
        type: ApiGatewayEventType.REQUEST_RECEIVED,
        payload: { requestId: 'req_1', method: 'GET', path: '/api', queryParams: {}, headers: {}, clientIp: '1.1.1.1', timestamp: Date.now() } as RequestReceivedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: ApiGatewayEventType.REQUEST_ROUTED,
        payload: { requestId: 'req_1', routeId: 'r1', serviceName: 's1', targetUrl: 'http://s1', routingRule: 'prefix:/api', latencyMs: 5 } as RequestRoutedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const counts = processor.getEventCounts();
      expect(counts[ApiGatewayEventType.REQUEST_RECEIVED]).toBe(1);
      expect(counts[ApiGatewayEventType.REQUEST_ROUTED]).toBe(1);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(2);
    });

    it('should track average processing time', async () => {
      await processor.processEvent({
        type: ApiGatewayEventType.REQUEST_RECEIVED,
        payload: { requestId: 'req_1', method: 'GET', path: '/api', queryParams: {}, headers: {}, clientIp: '1.1.1.1', timestamp: Date.now() } as RequestReceivedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      const avgTime = processor.getAverageProcessingTime();
      expect(avgTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('adapters', () => {
    it('should route events to registered adapters', async () => {
      const event = {
        type: ApiGatewayEventType.REQUEST_RECEIVED,
        payload: { requestId: 'req_1', method: 'GET', path: '/api', queryParams: {}, headers: {}, clientIp: '1.1.1.1', timestamp: Date.now() } as RequestReceivedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      };

      await processor.processEvent(event);

      const status = adapter.getStatus();
      expect(status.executionCount).toBe(1);
    });

    it('should track adapter status', () => {
      const status = processor.getAdapterStatus();
      expect(status.inmemory).toBeDefined();
      expect(status.inmemory.adapter).toBe('inmemory');
    });
  });
});