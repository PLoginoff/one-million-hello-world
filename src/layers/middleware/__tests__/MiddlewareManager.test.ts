/**
 * Middleware Manager Unit Tests
 * 
 * Tests for MiddlewareManager implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { MiddlewareManager } from '../implementations/MiddlewareManager';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { HttpMethod, HttpVersion } from '../../http-parser/types/http-parser-types';
import { LogLevel, MetricType } from '../types/middleware-types';

describe('MiddlewareManager', () => {
  let manager: MiddlewareManager;

  beforeEach(() => {
    manager = new MiddlewareManager();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = manager.getConfig();

      expect(config).toBeDefined();
      expect(config.enableLogging).toBe(true);
      expect(config.enableMetrics).toBe(true);
      expect(config.enableTracing).toBe(true);
      expect(config.enableCorrelation).toBe(true);
      expect(config.logLevel).toBe(LogLevel.INFO);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableLogging: false,
        enableMetrics: false,
        enableTracing: false,
        enableCorrelation: false,
        logLevel: LogLevel.DEBUG,
        metricsFlushInterval: 30000,
      };

      manager.setConfig(newConfig);
      const config = manager.getConfig();

      expect(config.enableLogging).toBe(false);
      expect(config.enableMetrics).toBe(false);
      expect(config.enableTracing).toBe(false);
      expect(config.logLevel).toBe(LogLevel.DEBUG);
    });
  });

  describe('log', () => {
    it('should log message when enabled', () => {
      manager.log(LogLevel.INFO, 'Test message');

      const logs = manager.getLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].level).toBe(LogLevel.INFO);
    });

    it('should not log when disabled', () => {
      manager.setConfig({
        enableLogging: false,
        enableMetrics: true,
        enableTracing: true,
        enableCorrelation: true,
        logLevel: LogLevel.INFO,
        metricsFlushInterval: 60000,
      });

      manager.log(LogLevel.INFO, 'Test message');
      const logs = manager.getLogs();

      expect(logs).toHaveLength(0);
    });

    it('should filter logs below configured level', () => {
      manager.setConfig({
        enableLogging: true,
        enableMetrics: true,
        enableTracing: true,
        enableCorrelation: true,
        logLevel: LogLevel.WARN,
        metricsFlushInterval: 60000,
      });

      manager.log(LogLevel.DEBUG, 'Debug message');
      manager.log(LogLevel.INFO, 'Info message');
      manager.log(LogLevel.WARN, 'Warn message');
      const logs = manager.getLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.WARN);
    });

    it('should include context in log entry', () => {
      const context = { userId: '123', action: 'test' };
      manager.log(LogLevel.INFO, 'Test message', context);

      const logs = manager.getLogs();

      expect(logs[0].context).toEqual(context);
    });
  });

  describe('recordMetric', () => {
    it('should record metric when enabled', () => {
      const metric = {
        name: 'request_count',
        type: MetricType.COUNTER,
        value: 1,
        timestamp: new Date(),
      };

      manager.recordMetric(metric);
      const metrics = manager.getMetrics();

      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('request_count');
    });

    it('should not record metric when disabled', () => {
      manager.setConfig({
        enableLogging: true,
        enableMetrics: false,
        enableTracing: true,
        enableCorrelation: true,
        logLevel: LogLevel.INFO,
        metricsFlushInterval: 60000,
      });

      const metric = {
        name: 'request_count',
        type: MetricType.COUNTER,
        value: 1,
        timestamp: new Date(),
      };

      manager.recordMetric(metric);
      const metrics = manager.getMetrics();

      expect(metrics).toHaveLength(0);
    });
  });

  describe('createSpan', () => {
    it('should create span when tracing enabled', () => {
      const span = manager.createSpan('test-operation');

      expect(span.operationName).toBe('test-operation');
      expect(span.traceId).toBeDefined();
      expect(span.spanId).toBeDefined();
      expect(span.startTime).toBeDefined();
    });

    it('should create span with parent when provided', () => {
      const parentSpan = manager.createSpan('parent');
      const childSpan = manager.createSpan('child', parentSpan.spanId);

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
    });

    it('should create dummy span when tracing disabled', () => {
      manager.setConfig({
        enableLogging: true,
        enableMetrics: true,
        enableTracing: false,
        enableCorrelation: true,
        logLevel: LogLevel.INFO,
        metricsFlushInterval: 60000,
      });

      const span = manager.createSpan('test-operation');

      expect(span.traceId).toBe('dummy');
      expect(span.spanId).toBe('dummy');
    });
  });

  describe('finishSpan', () => {
    it('should finish span and calculate duration', () => {
      const span = manager.createSpan('test-operation');

      setTimeout(() => {
        manager.finishSpan(span);
      }, 10);

      setTimeout(() => {
        const duration = span.duration;
        expect(duration).toBeGreaterThan(0);
      }, 20);
    });
  });

  describe('getCorrelationContext', () => {
    it('should create correlation context from request', () => {
      const request = createMockRequest();

      const context = manager.getCorrelationContext(request);

      expect(context.correlationId).toBeDefined();
      expect(context.traceId).toBeDefined();
      expect(context.requestId).toBeDefined();
    });

    it('should extract IDs from request headers', () => {
      const request = createMockRequest();
      request.headers.set('x-request-id', 'req-123');
      request.headers.set('x-correlation-id', 'corr-456');
      request.headers.set('x-trace-id', 'trace-789');
      request.headers.set('x-user-id', 'user-001');

      const context = manager.getCorrelationContext(request);

      expect(context.requestId).toBe('req-123');
      expect(context.correlationId).toBe('corr-456');
      expect(context.traceId).toBe('trace-789');
      expect(context.userId).toBe('user-001');
    });

    it('should create dummy context when correlation disabled', () => {
      manager.setConfig({
        enableLogging: true,
        enableMetrics: true,
        enableTracing: true,
        enableCorrelation: false,
        logLevel: LogLevel.INFO,
        metricsFlushInterval: 60000,
      });

      const request = createMockRequest();
      const context = manager.getCorrelationContext(request);

      expect(context.correlationId).toBe('dummy');
      expect(context.traceId).toBe('dummy');
      expect(context.requestId).toBe('dummy');
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs', () => {
      manager.log(LogLevel.INFO, 'Test message');
      manager.clearLogs();
      const logs = manager.getLogs();

      expect(logs).toHaveLength(0);
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      const metric = {
        name: 'test',
        type: MetricType.COUNTER,
        value: 1,
        timestamp: new Date(),
      };

      manager.recordMetric(metric);
      manager.clearMetrics();
      const metrics = manager.getMetrics();

      expect(metrics).toHaveLength(0);
    });
  });
});

function createMockRequest(): HttpRequest {
  return {
    line: {
      method: HttpMethod.GET,
      path: '/',
      version: HttpVersion.HTTP_1_1,
    },
    headers: new Map([
      ['host', 'localhost'],
      ['user-agent', 'test-agent'],
    ]),
    body: Buffer.from(''),
    raw: Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n'),
  };
}
