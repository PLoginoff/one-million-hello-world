/**
 * Middleware Manager Integration Tests
 * 
 * Integration tests for Middleware Manager implementation.
 * Tests full workflows, configuration chaining, statistics tracking, and advanced features.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { MiddlewareManager } from '../implementations/MiddlewareManager';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  LogLevel,
  LogCategory,
  MetricType,
  SpanStatus,
  SpanEvent,
  SpanLink,
  SpanError,
  LogFilter,
  MetricFilter,
  SpanFilter,
  MiddlewarePipeline,
  PipelineStage,
  StageType,
} from '../types/middleware-types';

describe('MiddlewareManager Integration', () => {
  let manager: MiddlewareManager;

  beforeEach(() => {
    manager = new MiddlewareManager();
  });

  describe('Full Workflow', () => {
    it('should complete full workflow with logging, metrics, and tracing', () => {
      manager.setConfig({
        enableLogging: true,
        enableMetrics: true,
        enableTracing: true,
        enableCorrelation: true,
        logLevel: LogLevel.INFO,
        metricsFlushInterval: 60000,
      });

      manager.log(LogLevel.INFO, 'Test message');
      manager.logWithCategory(LogLevel.INFO, LogCategory.HTTP, 'HTTP request');

      manager.recordMetric({ name: 'http_requests', type: MetricType.COUNTER, value: 1, timestamp: new Date() });
      manager.recordMetric({ name: 'http_requests', type: MetricType.COUNTER, value: 1, timestamp: new Date() });

      const span = manager.createSpan('http_handler');
      manager.finishSpan(span);

      const logs = manager.getLogs();
      const metrics = manager.getMetrics();
      const spans = manager.getSpans();

      expect(logs.length).toBe(2);
      expect(metrics.length).toBe(2);
      expect(spans.length).toBe(1);
    });
  });

  describe('Configuration Chaining', () => {
    it('should support configuration updates during operation', () => {
      manager.setConfig({ logLevel: LogLevel.DEBUG });
      manager.log(LogLevel.DEBUG, 'Debug message');

      manager.setConfig({ logLevel: LogLevel.INFO });
      manager.log(LogLevel.DEBUG, 'This should not be logged');

      const logs = manager.getLogs();
      expect(logs.length).toBe(1);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track statistics across multiple operations', () => {
      for (let i = 0; i < 5; i++) {
        manager.log(LogLevel.INFO, `Message ${i}`);
        manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: i, timestamp: new Date() });
      }

      const stats = manager.getStatistics();
      expect(stats.totalLogs).toBe(5);
      expect(stats.totalMetrics).toBe(5);
    });
  });

  describe('Health Status Integration', () => {
    it('should provide accurate health status based on configuration', () => {
      manager.setConfig({ enableLogging: false });

      const health = manager.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.score).toBeLessThan(100);
    });
  });

  describe('Diagnostics Integration', () => {
    it('should provide comprehensive diagnostics', () => {
      const diagnostics = manager.runDiagnostics();

      expect(diagnostics.traceId).toBeDefined();
      expect(diagnostics.steps.length).toBe(4);
      expect(diagnostics.summary.overallStatus).toBe('success');
    });
  });

  describe('Aggregation Integration', () => {
    it('should integrate log aggregation with filtering', () => {
      manager.log(LogLevel.INFO, 'Message 1');
      manager.log(LogLevel.ERROR, 'Error message');
      manager.log(LogLevel.WARN, 'Warning message');

      const filter: LogFilter = { level: LogLevel.ERROR };
      const aggregation = manager.aggregateLogs(filter);

      expect(aggregation.count).toBe(1);
      expect(aggregation.byLevel[LogLevel.ERROR]).toBe(1);
    });

    it('should integrate metric aggregation with filtering', () => {
      const now = new Date();
      manager.recordMetric({ name: 'metric1', type: MetricType.COUNTER, value: 10, timestamp: now });
      manager.recordMetric({ name: 'metric2', type: MetricType.COUNTER, value: 20, timestamp: now });

      const aggregation = manager.aggregateMetrics('metric1');

      expect(aggregation.name).toBe('metric1');
      expect(aggregation.statistics.count).toBe(1);
    });
  });

  describe('Pipeline Integration', () => {
    it('should integrate pipeline with stages', () => {
      const pipeline: MiddlewarePipeline = {
        name: 'request_pipeline',
        stages: [],
        enabled: true,
      };

      manager.addPipeline(pipeline);

      const stage1: PipelineStage = {
        name: 'logging',
        type: StageType.LOGGING,
        order: 1,
        enabled: true,
      };

      const stage2: PipelineStage = {
        name: 'metrics',
        type: StageType.METRICS,
        order: 2,
        enabled: true,
      };

      manager.addPipelineStage('request_pipeline', stage1);
      manager.addPipelineStage('request_pipeline', stage2);

      const retrievedPipeline = manager.getPipeline('request_pipeline');

      expect(retrievedPipeline?.stages.length).toBe(2);
      expect(retrievedPipeline?.stages[0].order).toBe(1);
      expect(retrievedPipeline?.stages[1].order).toBe(2);
    });
  });

  describe('Tracing Integration', () => {
    it('should integrate span events and links', () => {
      const parentSpan = manager.createSpan('parent_operation');
      const childSpan = manager.createSpan('child_operation', parentSpan.spanId);

      const event: SpanEvent = {
        timestamp: new Date(),
        name: 'custom_event',
        attributes: { key: 'value' },
      };

      const link: SpanLink = {
        traceId: 'external_trace',
        spanId: 'external_span',
      };

      manager.addSpanEvent(childSpan, event);
      manager.addSpanLink(childSpan, link);

      manager.finishSpan(childSpan);
      manager.finishSpan(parentSpan);

      const retrievedChildSpan = manager.getSpanById(childSpan.spanId);

      expect(retrievedChildSpan?.events?.length).toBe(1);
      expect(retrievedChildSpan?.links?.length).toBe(1);
    });

    it('should integrate span status with errors', () => {
      const span = manager.createSpan('failing_operation');

      const error: SpanError = {
        type: 'Error',
        message: 'Operation failed',
        stack: 'Error: Operation failed\n    at test.js:10:5',
      };

      manager.setSpanStatus(span, SpanStatus.ERROR, error);
      manager.finishSpan(span);

      const retrievedSpan = manager.getSpanById(span.spanId);

      expect(retrievedSpan?.status).toBe(SpanStatus.ERROR);
      expect(retrievedSpan?.error?.message).toBe('Operation failed');
    });
  });

  describe('Correlation Integration', () => {
    it('should integrate correlation context with headers', () => {
      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([
          ['x-request-id', 'req-123'],
          ['x-correlation-id', 'corr-456'],
          ['x-trace-id', 'trace-789'],
          ['x-user-id', 'user-abc'],
        ]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const context = manager.getCorrelationContext(request);
      const retrievedContext = manager.getCorrelationContextByRequestId('req-123');

      expect(context.requestId).toBe('req-123');
      expect(context.correlationId).toBe('corr-456');
      expect(context.traceId).toBe('trace-789');
      expect(context.userId).toBe('user-abc');
      expect(retrievedContext?.requestId).toBe('req-123');
    });
  });

  describe('Filtering Integration', () => {
    it('should integrate multiple filter criteria', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      manager.logWithCategory(LogLevel.INFO, LogCategory.HTTP, 'HTTP message 1');
      manager.logWithCategory(LogLevel.ERROR, LogCategory.HTTP, 'HTTP error');
      manager.logWithCategory(LogLevel.INFO, LogCategory.DATABASE, 'Database message');

      const filter: LogFilter = {
        level: LogLevel.INFO,
        category: LogCategory.HTTP,
        startTime: yesterday,
        endTime: tomorrow,
      };

      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(1);
      expect(filteredLogs[0].level).toBe(LogLevel.INFO);
      expect(filteredLogs[0].category).toBe(LogCategory.HTTP);
    });
  });

  describe('Statistics Reset Integration', () => {
    it('should integrate statistics reset with ongoing operations', () => {
      manager.log(LogLevel.INFO, 'Message 1');
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: 10, timestamp: new Date() });

      manager.resetStatistics();

      manager.log(LogLevel.INFO, 'Message 2');
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: 20, timestamp: new Date() });

      const stats = manager.getStatistics();

      expect(stats.totalLogs).toBe(1);
      expect(stats.totalMetrics).toBe(1);
    });
  });

  describe('Pipeline Management Integration', () => {
    it('should integrate pipeline enable/disable with operations', () => {
      const pipeline: MiddlewarePipeline = {
        name: 'test_pipeline',
        stages: [],
        enabled: true,
      };

      manager.addPipeline(pipeline);
      manager.disablePipeline('test_pipeline');

      const retrievedPipeline = manager.getPipeline('test_pipeline');

      expect(retrievedPipeline?.enabled).toBe(false);

      manager.enablePipeline('test_pipeline');

      const enabledPipeline = manager.getPipeline('test_pipeline');

      expect(enabledPipeline?.enabled).toBe(true);
    });
  });

  describe('Flush Operations Integration', () => {
    it('should integrate flush with statistics', () => {
      manager.log(LogLevel.INFO, 'Message 1');
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: 10, timestamp: new Date() });

      manager.flushMetrics();

      const stats = manager.getStatistics();

      expect(stats.totalMetrics).toBe(2);
      expect(manager.getMetrics().length).toBe(0);
    });
  });

  describe('Complex Workflow Integration', () => {
    it('should handle complex workflow with all features', () => {
      manager.setConfig({
        enableLogging: true,
        enableMetrics: true,
        enableTracing: true,
        enableCorrelation: true,
        logLevel: LogLevel.DEBUG,
      });

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['x-request-id', 'req-123']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const context = manager.getCorrelationContext(request);

      manager.logWithCategory(LogLevel.INFO, LogCategory.HTTP, 'Request received', { requestId: context.requestId });
      manager.recordMetric({ name: 'requests_total', type: MetricType.COUNTER, value: 1, timestamp: new Date() });

      const span = manager.createSpan('request_processing');
      manager.finishSpan(span);

      const logs = manager.getLogs();
      const metrics = manager.getMetrics();
      const spans = manager.getSpans();
      const stats = manager.getStatistics();

      expect(logs.length).toBe(1);
      expect(metrics.length).toBe(1);
      expect(spans.length).toBe(1);
      expect(stats.totalLogs).toBe(1);
      expect(stats.totalMetrics).toBe(1);
      expect(stats.totalSpans).toBe(1);
    });
  });
});
