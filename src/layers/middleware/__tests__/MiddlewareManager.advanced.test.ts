/**
 * Middleware Manager Advanced Tests
 * 
 * Advanced tests for Middleware Manager implementation.
 * Tests extended logging, metrics, tracing, correlation, pipelines, health, diagnostics, and statistics.
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

describe('MiddlewareManager Advanced', () => {
  let manager: MiddlewareManager;

  beforeEach(() => {
    manager = new MiddlewareManager();
  });

  describe('Extended Logging', () => {
    it('should log with category', () => {
      manager.logWithCategory(LogLevel.INFO, LogCategory.HTTP, 'Test message');

      const logs = manager.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe(LogLevel.INFO);
      expect(logs[0].category).toBe(LogCategory.HTTP);
      expect(logs[0].message).toBe('Test message');
    });

    it('should filter logs by level', () => {
      manager.log(LogLevel.INFO, 'Info message');
      manager.log(LogLevel.ERROR, 'Error message');
      manager.log(LogLevel.WARN, 'Warning message');

      const filter: LogFilter = { level: LogLevel.ERROR };
      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(1);
      expect(filteredLogs[0].level).toBe(LogLevel.ERROR);
    });

    it('should filter logs by category', () => {
      manager.logWithCategory(LogLevel.INFO, LogCategory.HTTP, 'HTTP message');
      manager.logWithCategory(LogLevel.INFO, LogCategory.DATABASE, 'Database message');

      const filter: LogFilter = { category: LogCategory.HTTP };
      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(1);
      expect(filteredLogs[0].category).toBe(LogCategory.HTTP);
    });

    it('should filter logs by time range', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      manager.log(LogLevel.INFO, 'Message 1');

      const filter: LogFilter = { startTime: yesterday, endTime: tomorrow };
      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(1);
    });

    it('should filter logs by message pattern', () => {
      manager.log(LogLevel.INFO, 'Error occurred');
      manager.log(LogLevel.INFO, 'Success message');
      manager.log(LogLevel.INFO, 'Another error');

      const filter: LogFilter = { messagePattern: 'error' };
      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(2);
    });

    it('should limit filtered logs', () => {
      manager.log(LogLevel.INFO, 'Message 1');
      manager.log(LogLevel.INFO, 'Message 2');
      manager.log(LogLevel.INFO, 'Message 3');

      const filter: LogFilter = { limit: 2 };
      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(2);
    });
  });

  describe('Extended Metrics', () => {
    it('should get metric statistics', () => {
      const now = new Date();
      manager.recordMetric({ name: 'test_metric', type: MetricType.COUNTER, value: 10, timestamp: now });
      manager.recordMetric({ name: 'test_metric', type: MetricType.COUNTER, value: 20, timestamp: now });
      manager.recordMetric({ name: 'test_metric', type: MetricType.COUNTER, value: 30, timestamp: now });

      const stats = manager.getMetricStatistics('test_metric');

      expect(stats.count).toBe(3);
      expect(stats.sum).toBe(60);
      expect(stats.avg).toBe(20);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(30);
    });

    it('should filter metrics by name', () => {
      const now = new Date();
      manager.recordMetric({ name: 'metric1', type: MetricType.COUNTER, value: 10, timestamp: now });
      manager.recordMetric({ name: 'metric2', type: MetricType.COUNTER, value: 20, timestamp: now });

      const filter: MetricFilter = { name: 'metric1' };
      const filteredMetrics = manager.getFilteredMetrics(filter);

      expect(filteredMetrics.length).toBe(1);
      expect(filteredMetrics[0].name).toBe('metric1');
    });

    it('should filter metrics by type', () => {
      const now = new Date();
      manager.recordMetric({ name: 'metric1', type: MetricType.COUNTER, value: 10, timestamp: now });
      manager.recordMetric({ name: 'metric2', type: MetricType.GAUGE, value: 20, timestamp: now });

      const filter: MetricFilter = { type: MetricType.COUNTER };
      const filteredMetrics = manager.getFilteredMetrics(filter);

      expect(filteredMetrics.length).toBe(1);
      expect(filteredMetrics[0].type).toBe(MetricType.COUNTER);
    });

    it('should filter metrics by labels', () => {
      const now = new Date();
      manager.recordMetric({ name: 'metric1', type: MetricType.COUNTER, value: 10, labels: { env: 'prod' }, timestamp: now });
      manager.recordMetric({ name: 'metric2', type: MetricType.COUNTER, value: 20, labels: { env: 'dev' }, timestamp: now });

      const filter: MetricFilter = { labels: { env: 'prod' } };
      const filteredMetrics = manager.getFilteredMetrics(filter);

      expect(filteredMetrics.length).toBe(1);
      expect(filteredMetrics[0].labels?.env).toBe('prod');
    });
  });

  describe('Extended Tracing', () => {
    it('should add event to span', () => {
      const span = manager.createSpan('test_operation');

      const event: SpanEvent = {
        timestamp: new Date(),
        name: 'custom_event',
        attributes: { key: 'value' },
      };

      manager.addSpanEvent(span, event);

      const retrievedSpan = manager.getSpanById(span.spanId);
      expect(retrievedSpan?.events).toBeDefined();
      expect(retrievedSpan?.events?.length).toBe(1);
      expect(retrievedSpan?.events?.[0].name).toBe('custom_event');
    });

    it('should add link to span', () => {
      const span = manager.createSpan('test_operation');

      const link: SpanLink = {
        traceId: 'trace-123',
        spanId: 'span-123',
        attributes: { type: 'parent' },
      };

      manager.addSpanLink(span, link);

      const retrievedSpan = manager.getSpanById(span.spanId);
      expect(retrievedSpan?.links).toBeDefined();
      expect(retrievedSpan?.links?.length).toBe(1);
      expect(retrievedSpan?.links?.[0].traceId).toBe('trace-123');
    });

    it('should set span status', () => {
      const span = manager.createSpan('test_operation');

      const error: SpanError = {
        type: 'Error',
        message: 'Something went wrong',
      };

      manager.setSpanStatus(span, SpanStatus.ERROR, error);

      const retrievedSpan = manager.getSpanById(span.spanId);
      expect(retrievedSpan?.status).toBe(SpanStatus.ERROR);
      expect(retrievedSpan?.error?.message).toBe('Something went wrong');
    });

    it('should filter spans by trace ID', () => {
      const span1 = manager.createSpan('operation1');
      const span2 = manager.createSpan('operation2');

      const filter: SpanFilter = { traceId: span1.traceId };
      const filteredSpans = manager.getFilteredSpans(filter);

      expect(filteredSpans.length).toBe(1);
      expect(filteredSpans[0].traceId).toBe(span1.traceId);
    });

    it('should filter spans by operation name', () => {
      const span1 = manager.createSpan('operation1');
      const span2 = manager.createSpan('operation2');

      const filter: SpanFilter = { operationName: 'operation1' };
      const filteredSpans = manager.getFilteredSpans(filter);

      expect(filteredSpans.length).toBe(1);
      expect(filteredSpans[0].operationName).toBe('operation1');
    });

    it('should filter spans by status', () => {
      const span1 = manager.createSpan('operation1');
      manager.setSpanStatus(span1, SpanStatus.ERROR);

      const span2 = manager.createSpan('operation2');
      manager.setSpanStatus(span2, SpanStatus.OK);

      const filter: SpanFilter = { status: SpanStatus.ERROR };
      const filteredSpans = manager.getFilteredSpans(filter);

      expect(filteredSpans.length).toBe(1);
      expect(filteredSpans[0].status).toBe(SpanStatus.ERROR);
    });

    it('should get spans by trace ID', () => {
      const span1 = manager.createSpan('operation1');
      const span2 = manager.createSpan('operation2', span1.spanId);

      const spans = manager.getSpansByTraceId(span1.traceId);

      expect(spans.length).toBe(2);
      expect(spans[0].traceId).toBe(span1.traceId);
      expect(spans[1].traceId).toBe(span1.traceId);
    });
  });

  describe('Pipeline Management', () => {
    it('should add pipeline', () => {
      const pipeline: MiddlewarePipeline = {
        name: 'test_pipeline',
        stages: [],
        enabled: true,
      };

      manager.addPipeline(pipeline);

      const retrievedPipeline = manager.getPipeline('test_pipeline');
      expect(retrievedPipeline).toBeDefined();
      expect(retrievedPipeline?.name).toBe('test_pipeline');
    });

    it('should remove pipeline', () => {
      const pipeline: MiddlewarePipeline = {
        name: 'test_pipeline',
        stages: [],
        enabled: true,
      };

      manager.addPipeline(pipeline);
      manager.removePipeline('test_pipeline');

      const retrievedPipeline = manager.getPipeline('test_pipeline');
      expect(retrievedPipeline).toBeUndefined();
    });

    it('should get all pipelines', () => {
      const pipeline1: MiddlewarePipeline = {
        name: 'pipeline1',
        stages: [],
        enabled: true,
      };

      const pipeline2: MiddlewarePipeline = {
        name: 'pipeline2',
        stages: [],
        enabled: true,
      };

      manager.addPipeline(pipeline1);
      manager.addPipeline(pipeline2);

      const pipelines = manager.getPipelines();
      expect(pipelines.length).toBe(2);
    });

    it('should add stage to pipeline', () => {
      const pipeline: MiddlewarePipeline = {
        name: 'test_pipeline',
        stages: [],
        enabled: true,
      };

      manager.addPipeline(pipeline);

      const stage: PipelineStage = {
        name: 'logging_stage',
        type: StageType.LOGGING,
        order: 1,
        enabled: true,
      };

      manager.addPipelineStage('test_pipeline', stage);

      const retrievedPipeline = manager.getPipeline('test_pipeline');
      expect(retrievedPipeline?.stages.length).toBe(1);
      expect(retrievedPipeline?.stages[0].name).toBe('logging_stage');
    });

    it('should remove stage from pipeline', () => {
      const pipeline: MiddlewarePipeline = {
        name: 'test_pipeline',
        stages: [],
        enabled: true,
      };

      manager.addPipeline(pipeline);

      const stage: PipelineStage = {
        name: 'logging_stage',
        type: StageType.LOGGING,
        order: 1,
        enabled: true,
      };

      manager.addPipelineStage('test_pipeline', stage);
      manager.removePipelineStage('test_pipeline', 'logging_stage');

      const retrievedPipeline = manager.getPipeline('test_pipeline');
      expect(retrievedPipeline?.stages.length).toBe(0);
    });

    it('should enable pipeline', () => {
      const pipeline: MiddlewarePipeline = {
        name: 'test_pipeline',
        stages: [],
        enabled: false,
      };

      manager.addPipeline(pipeline);
      manager.enablePipeline('test_pipeline');

      const retrievedPipeline = manager.getPipeline('test_pipeline');
      expect(retrievedPipeline?.enabled).toBe(true);
    });

    it('should disable pipeline', () => {
      const pipeline: MiddlewarePipeline = {
        name: 'test_pipeline',
        stages: [],
        enabled: true,
      };

      manager.addPipeline(pipeline);
      manager.disablePipeline('test_pipeline');

      const retrievedPipeline = manager.getPipeline('test_pipeline');
      expect(retrievedPipeline?.enabled).toBe(false);
    });
  });

  describe('Health and Diagnostics', () => {
    it('should get health status', () => {
      const health = manager.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.score).toBe(100);
      expect(health.checks.length).toBe(4);
    });

    it('should run diagnostics', () => {
      const diagnostics = manager.runDiagnostics();

      expect(diagnostics.traceId).toBeDefined();
      expect(diagnostics.steps.length).toBe(4);
      expect(diagnostics.summary.overallStatus).toBe('success');
    });
  });

  describe('Statistics', () => {
    it('should get statistics', () => {
      manager.log(LogLevel.INFO, 'Test log');
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: 10, timestamp: new Date() });

      const stats = manager.getStatistics();

      expect(stats.totalLogs).toBe(1);
      expect(stats.totalMetrics).toBe(1);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should reset statistics', () => {
      manager.log(LogLevel.INFO, 'Test log');
      manager.resetStatistics();

      const stats = manager.getStatistics();

      expect(stats.totalLogs).toBe(0);
      expect(stats.totalMetrics).toBe(0);
    });
  });

  describe('Aggregation', () => {
    it('should aggregate logs', () => {
      manager.log(LogLevel.INFO, 'Message 1');
      manager.log(LogLevel.ERROR, 'Message 2');
      manager.log(LogLevel.WARN, 'Message 1');

      const aggregation = manager.aggregateLogs();

      expect(aggregation.count).toBe(3);
      expect(aggregation.byLevel[LogLevel.INFO]).toBe(1);
      expect(aggregation.byLevel[LogLevel.ERROR]).toBe(1);
      expect(aggregation.topMessages.length).toBeGreaterThan(0);
    });

    it('should aggregate metrics', () => {
      const now = new Date();
      manager.recordMetric({ name: 'test_metric', type: MetricType.COUNTER, value: 10, timestamp: now });
      manager.recordMetric({ name: 'test_metric', type: MetricType.COUNTER, value: 20, timestamp: now });

      const aggregation = manager.aggregateMetrics('test_metric');

      expect(aggregation.name).toBe('test_metric');
      expect(aggregation.statistics.count).toBe(2);
      expect(aggregation.statistics.sum).toBe(30);
    });
  });

  describe('Flush Operations', () => {
    it('should flush metrics', () => {
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: 10, timestamp: new Date() });
      manager.flushMetrics();

      const metrics = manager.getMetrics();
      expect(metrics.length).toBe(0);
    });

    it('should flush logs', () => {
      manager.log(LogLevel.INFO, 'Test log');
      manager.flushLogs();

      const logs = manager.getLogs();
      expect(logs.length).toBe(0);
    });
  });

  describe('Correlation Context', () => {
    it('should get correlation context by request ID', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/test', version: 'HTTP/1.1' as const },
        headers: new Map([['x-request-id', 'req-123']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET /test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const context = manager.getCorrelationContext(request);
      const retrievedContext = manager.getCorrelationContextByRequestId('req-123');

      expect(retrievedContext).toBeDefined();
      expect(retrievedContext?.requestId).toBe('req-123');
    });
  });
});
