/**
 * Middleware Manager Edge Cases Tests
 * 
 * Edge case tests for Middleware Manager implementation.
 * Tests error handling, empty/malformed inputs, boundary values, and unusual scenarios.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { MiddlewareManager } from '../implementations/MiddlewareManager';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  LogLevel,
  MetricType,
  SpanStatus,
  LogFilter,
  MetricFilter,
  SpanFilter,
  MiddlewarePipeline,
  PipelineStage,
  StageType,
} from '../types/middleware-types';

describe('MiddlewareManager Edge Cases', () => {
  let manager: MiddlewareManager;

  beforeEach(() => {
    manager = new MiddlewareManager();
  });

  describe('Empty and Null Inputs', () => {
    it('should handle empty log message', () => {
      manager.log(LogLevel.INFO, '');

      const logs = manager.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('');
    });

    it('should handle null context in log', () => {
      manager.log(LogLevel.INFO, 'Test', null as any);

      const logs = manager.getLogs();
      expect(logs.length).toBe(1);
    });

    it('should handle empty metric name', () => {
      manager.recordMetric({ name: '', type: MetricType.COUNTER, value: 10, timestamp: new Date() });

      const metrics = manager.getMetrics();
      expect(metrics.length).toBe(1);
    });

    it('should handle empty span operation name', () => {
      const span = manager.createSpan('');

      expect(span.operationName).toBe('');
    });

    it('should handle empty pipeline name', () => {
      const pipeline: MiddlewarePipeline = {
        name: '',
        stages: [],
        enabled: true,
      };

      manager.addPipeline(pipeline);

      const retrievedPipeline = manager.getPipeline('');
      expect(retrievedPipeline).toBeDefined();
    });
  });

  describe('Boundary Values', () => {
    it('should handle very long log message', () => {
      const longMessage = 'A'.repeat(10000);
      manager.log(LogLevel.INFO, longMessage);

      const logs = manager.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message.length).toBe(10000);
    });

    it('should handle very large metric value', () => {
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: Number.MAX_SAFE_INTEGER, timestamp: new Date() });

      const metrics = manager.getMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0].value).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle very small metric value', () => {
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: Number.MIN_SAFE_INTEGER, timestamp: new Date() });

      const metrics = manager.getMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0].value).toBe(Number.MIN_SAFE_INTEGER);
    });

    it('should handle zero metric value', () => {
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: 0, timestamp: new Date() });

      const metrics = manager.getMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0].value).toBe(0);
    });

    it('should handle negative metric value', () => {
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: -100, timestamp: new Date() });

      const metrics = manager.getMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0].value).toBe(-100);
    });
  });

  describe('Disabled Features', () => {
    it('should not log when logging is disabled', () => {
      manager.setConfig({ enableLogging: false });
      manager.log(LogLevel.INFO, 'Test message');

      const logs = manager.getLogs();
      expect(logs.length).toBe(0);
    });

    it('should not record metrics when metrics are disabled', () => {
      manager.setConfig({ enableMetrics: false });
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: 10, timestamp: new Date() });

      const metrics = manager.getMetrics();
      expect(metrics.length).toBe(0);
    });

    it('should not create spans when tracing is disabled', () => {
      manager.setConfig({ enableTracing: false });
      const span = manager.createSpan('test_operation');

      expect(span.traceId).toBe('dummy');
      expect(span.spanId).toBe('dummy');
    });

    it('should not create correlation context when correlation is disabled', () => {
      manager.setConfig({ enableCorrelation: false });

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/test', version: 'HTTP/1.1' as const },
        headers: new Map([['x-request-id', 'req-123']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET /test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const context = manager.getCorrelationContext(request);

      expect(context.correlationId).toBe('dummy');
      expect(context.traceId).toBe('dummy');
    });
  });

  describe('Filter Edge Cases', () => {
    it('should handle empty log filter', () => {
      manager.log(LogLevel.INFO, 'Test');

      const filter: LogFilter = {};
      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(1);
    });

    it('should handle empty metric filter', () => {
      manager.recordMetric({ name: 'test', type: MetricType.COUNTER, value: 10, timestamp: new Date() });

      const filter: MetricFilter = {};
      const filteredMetrics = manager.getFilteredMetrics(filter);

      expect(filteredMetrics.length).toBe(1);
    });

    it('should handle empty span filter', () => {
      manager.createSpan('test');

      const filter: SpanFilter = {};
      const filteredSpans = manager.getFilteredSpans(filter);

      expect(filteredSpans.length).toBe(1);
    });

    it('should handle filter with no matches', () => {
      manager.log(LogLevel.INFO, 'Test');

      const filter: LogFilter = { level: LogLevel.ERROR };
      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(0);
    });

    it('should handle filter limit of zero', () => {
      manager.log(LogLevel.INFO, 'Test 1');
      manager.log(LogLevel.INFO, 'Test 2');

      const filter: LogFilter = { limit: 0 };
      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(0);
    });

    it('should handle filter limit larger than available logs', () => {
      manager.log(LogLevel.INFO, 'Test');

      const filter: LogFilter = { limit: 100 };
      const filteredLogs = manager.getFilteredLogs(filter);

      expect(filteredLogs.length).toBe(1);
    });
  });

  describe('Pipeline Edge Cases', () => {
    it('should handle removing non-existent pipeline', () => {
      manager.removePipeline('non_existent_pipeline');

      expect(manager.getPipeline('non_existent_pipeline')).toBeUndefined();
    });

    it('should handle adding stage to non-existent pipeline', () => {
      const stage: PipelineStage = {
        name: 'test_stage',
        type: StageType.LOGGING,
        order: 1,
        enabled: true,
      };

      manager.addPipelineStage('non_existent_pipeline', stage);

      expect(manager.getPipeline('non_existent_pipeline')).toBeUndefined();
    });

    it('should handle removing stage from non-existent pipeline', () => {
      manager.removePipelineStage('non_existent_pipeline', 'test_stage');

      expect(manager.getPipeline('non_existent_pipeline')).toBeUndefined();
    });

    it('should handle enabling non-existent pipeline', () => {
      manager.enablePipeline('non_existent_pipeline');

      expect(manager.getPipeline('non_existent_pipeline')).toBeUndefined();
    });

    it('should handle disabling non-existent pipeline', () => {
      manager.disablePipeline('non_existent_pipeline');

      expect(manager.getPipeline('non_existent_pipeline')).toBeUndefined();
    });

    it('should handle duplicate pipeline names', () => {
      const pipeline1: MiddlewarePipeline = {
        name: 'duplicate',
        stages: [],
        enabled: true,
      };

      const pipeline2: MiddlewarePipeline = {
        name: 'duplicate',
        stages: [],
        enabled: false,
      };

      manager.addPipeline(pipeline1);
      manager.addPipeline(pipeline2);

      const retrievedPipeline = manager.getPipeline('duplicate');
      expect(retrievedPipeline?.enabled).toBe(false);
    });
  });

  describe('Span Edge Cases', () => {
    it('should handle finishing non-existent span', () => {
      const span = {
        traceId: 'trace-123',
        spanId: 'span-123',
        operationName: 'test',
        startTime: new Date(),
      };

      manager.finishSpan(span);

      expect(manager.getSpanById('span-123')).toBeUndefined();
    });

    it('should handle adding event to non-existent span', () => {
      const span = {
        traceId: 'trace-123',
        spanId: 'span-123',
        operationName: 'test',
        startTime: new Date(),
      };

      const event = {
        timestamp: new Date(),
        name: 'test_event',
      };

      manager.addSpanEvent(span, event);

      expect(manager.getSpanById('span-123')).toBeUndefined();
    });

    it('should handle adding link to non-existent span', () => {
      const span = {
        traceId: 'trace-123',
        spanId: 'span-123',
        operationName: 'test',
        startTime: new Date(),
      };

      const link = {
        traceId: 'trace-456',
        spanId: 'span-456',
      };

      manager.addSpanLink(span, link);

      expect(manager.getSpanById('span-123')).toBeUndefined();
    });

    it('should handle setting status of non-existent span', () => {
      const span = {
        traceId: 'trace-123',
        spanId: 'span-123',
        operationName: 'test',
        startTime: new Date(),
      };

      manager.setSpanStatus(span, SpanStatus.ERROR);

      expect(manager.getSpanById('span-123')).toBeUndefined();
    });
  });

  describe('Statistics Edge Cases', () => {
    it('should handle statistics with no data', () => {
      const stats = manager.getStatistics();

      expect(stats.totalLogs).toBe(0);
      expect(stats.totalMetrics).toBe(0);
      expect(stats.totalSpans).toBe(0);
    });

    it('should handle metric statistics with no metrics', () => {
      const stats = manager.getMetricStatistics('non_existent_metric');

      expect(stats.count).toBe(0);
      expect(stats.sum).toBe(0);
      expect(stats.avg).toBe(0);
    });

    it('should handle log aggregation with no logs', () => {
      const aggregation = manager.aggregateLogs();

      expect(aggregation.count).toBe(0);
      expect(aggregation.topMessages.length).toBe(0);
    });

    it('should handle metric aggregation with no metrics', () => {
      const aggregation = manager.aggregateMetrics('non_existent_metric');

      expect(aggregation.name).toBe('non_existent_metric');
      expect(aggregation.statistics.count).toBe(0);
    });
  });

  describe('Correlation Context Edge Cases', () => {
    it('should handle getting context by non-existent request ID', () => {
      const context = manager.getCorrelationContextByRequestId('non_existent');

      expect(context).toBeUndefined();
    });

    it('should handle getting span by non-existent span ID', () => {
      const span = manager.getSpanById('non_existent');

      expect(span).toBeUndefined();
    });

    it('should handle getting spans by non-existent trace ID', () => {
      const spans = manager.getSpansByTraceId('non_existent');

      expect(spans.length).toBe(0);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle updating configuration with partial values', () => {
      manager.setConfig({ logLevel: LogLevel.DEBUG });

      const config = manager.getConfig();
      expect(config.logLevel).toBe(LogLevel.DEBUG);
      expect(config.enableLogging).toBe(true);
    });

    it('should handle updating configuration with all values', () => {
      manager.setConfig({
        enableLogging: false,
        enableMetrics: false,
        enableTracing: false,
        enableCorrelation: false,
        logLevel: LogLevel.DEBUG,
        metricsFlushInterval: 30000,
      });

      const config = manager.getConfig();
      expect(config.enableLogging).toBe(false);
      expect(config.enableMetrics).toBe(false);
      expect(config.enableTracing).toBe(false);
      expect(config.enableCorrelation).toBe(false);
      expect(config.logLevel).toBe(LogLevel.DEBUG);
      expect(config.metricsFlushInterval).toBe(30000);
    });
  });

  describe('Clear Operations Edge Cases', () => {
    it('should handle clearing empty logs', () => {
      manager.clearLogs();

      const logs = manager.getLogs();
      expect(logs.length).toBe(0);
    });

    it('should handle clearing empty metrics', () => {
      manager.clearMetrics();

      const metrics = manager.getMetrics();
      expect(metrics.length).toBe(0);
    });

    it('should handle clearing empty spans', () => {
      manager.clearSpans();

      const spans = manager.getSpans();
      expect(spans.length).toBe(0);
    });

    it('should handle clearing empty correlation contexts', () => {
      manager.clearCorrelationContexts();

      expect(manager.getCorrelationContextByRequestId('test')).toBeUndefined();
    });
  });

  describe('Flush Operations Edge Cases', () => {
    it('should handle flushing empty metrics', () => {
      manager.flushMetrics();

      const metrics = manager.getMetrics();
      expect(metrics.length).toBe(0);
    });

    it('should handle flushing empty logs', () => {
      manager.flushLogs();

      const logs = manager.getLogs();
      expect(logs.length).toBe(0);
    });
  });
});
