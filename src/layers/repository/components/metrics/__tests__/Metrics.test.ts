/**
 * Metrics Collector Layer Tests
 * 
 * Comprehensive test suite for MetricsCollector implementation.
 * Tests metric collection, aggregation, export, and statistics.
 */

import { MetricsCollector } from '../implementations/MetricsCollector';
import { IMetricsCollector } from '../interfaces/IMetricsCollector';
import {
  MetricType,
  MetricDefinition,
  PerformanceMetrics,
} from '../types/metrics-types';

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;

  beforeEach(() => {
    metricsCollector = new MetricsCollector();
  });

  describe('Initialization', () => {
    /**
     * Test that MetricsCollector initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = metricsCollector.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.sampleRate).toBe(1.0);
      expect(config.retentionPeriod).toBe(3600000);
      expect(config.enableProfiling).toBe(false);
      expect(config.enableMemoryTracking).toBe(false);
    });

    /**
     * Test that metrics map is initialized
     */
    it('should initialize with empty metrics map', () => {
      expect(metricsCollector.getMetricCount()).toBe(0);
    });
  });

  describe('Metric Registration', () => {
    /**
     * Test registering a metric
     */
    it('should register a metric successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: ['operation'],
      };

      metricsCollector.registerMetric(definition);

      expect(metricsCollector.hasMetric('test.counter')).toBe(true);
    });

    /**
     * Test unregistering a metric
     */
    it('should unregister a metric successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.unregisterMetric('test.counter');

      expect(metricsCollector.hasMetric('test.counter')).toBe(false);
    });
  });

  describe('Counter Metrics', () => {
    /**
     * Test incrementing a counter
     */
    it('should increment a counter successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.increment('test.counter', 5);

      const metric = metricsCollector.getMetric('test.counter');
      expect(metric?.values.length).toBe(1);
      expect(metric?.values[0].value).toBe(5);
    });

    /**
     * Test decrementing a counter
     */
    it('should decrement a counter successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.increment('test.counter', 10);
      metricsCollector.decrement('test.counter', 3);

      const metric = metricsCollector.getMetric('test.counter');
      expect(metric?.values.length).toBe(2);
    });
  });

  describe('Gauge Metrics', () => {
    /**
     * Test setting a gauge value
     */
    it('should set a gauge value successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.gauge',
        type: MetricType.GAUGE,
        description: 'Test gauge metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.gauge('test.gauge', 42);

      const metric = metricsCollector.getMetric('test.gauge');
      expect(metric?.values.length).toBe(1);
      expect(metric?.values[0].value).toBe(42);
    });
  });

  describe('Timing Metrics', () => {
    /**
     * Test recording a timing value
     */
    it('should record a timing value successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.timing',
        type: MetricType.HISTOGRAM,
        description: 'Test timing metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.timing('test.timing', 100);

      const metric = metricsCollector.getMetric('test.timing');
      expect(metric?.values.length).toBe(1);
      expect(metric?.values[0].value).toBe(100);
    });
  });

  describe('Histogram Metrics', () => {
    /**
     * Test recording a histogram value
     */
    it('should record a histogram value successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.histogram',
        type: MetricType.HISTOGRAM,
        description: 'Test histogram metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.histogram('test.histogram', 50);

      const metric = metricsCollector.getMetric('test.histogram');
      expect(metric?.values.length).toBe(1);
      expect(metric?.values[0].value).toBe(50);
    });
  });

  describe('Record Metric', () => {
    /**
     * Test recording a metric value
     */
    it('should record a metric value successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.metric',
        type: MetricType.GAUGE,
        description: 'Test metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.record('test.metric', 42);

      const metric = metricsCollector.getMetric('test.metric');
      expect(metric?.values.length).toBe(1);
      expect(metric?.values[0].value).toBe(42);
    });

    /**
     * Test recording metric with labels
     */
    it('should record metric with labels successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.metric',
        type: MetricType.COUNTER,
        description: 'Test metric',
        labels: ['operation'],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.record('test.metric', 1, { operation: 'read' });

      const metric = metricsCollector.getMetric('test.metric');
      expect(metric?.values[0].labels.operation).toBe('read');
    });
  });

  describe('Metric Retrieval', () => {
    /**
     * Test getting a metric
     */
    it('should get a metric successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      const metric = metricsCollector.getMetric('test.counter');

      expect(metric).toBeDefined();
      expect(metric?.definition.name).toBe('test.counter');
    });

    /**
     * Test getting all metrics
     */
    it('should get all metrics successfully', () => {
      const definition1: MetricDefinition = {
        name: 'test.counter1',
        type: MetricType.COUNTER,
        description: 'Test counter 1',
        labels: [],
      };

      const definition2: MetricDefinition = {
        name: 'test.counter2',
        type: MetricType.COUNTER,
        description: 'Test counter 2',
        labels: [],
      };

      metricsCollector.registerMetric(definition1);
      metricsCollector.registerMetric(definition2);

      const allMetrics = metricsCollector.getAllMetrics();

      expect(allMetrics.size).toBe(2);
    });

    /**
     * Test getting metrics by type
     */
    it('should get metrics by type successfully', () => {
      const counterDefinition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter',
        labels: [],
      };

      const gaugeDefinition: MetricDefinition = {
        name: 'test.gauge',
        type: MetricType.GAUGE,
        description: 'Test gauge',
        labels: [],
      };

      metricsCollector.registerMetric(counterDefinition);
      metricsCollector.registerMetric(gaugeDefinition);

      const counterMetrics = metricsCollector.getMetricsByType(MetricType.COUNTER);
      expect(counterMetrics.length).toBe(1);
    });

    /**
     * Test getting metrics with labels
     */
    it('should get metrics with labels successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.metric',
        type: MetricType.COUNTER,
        description: 'Test metric',
        labels: ['operation'],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.record('test.metric', 1, { operation: 'read' });

      const metricsWithLabels = metricsCollector.getMetricsWithLabels({ operation: 'read' });
      expect(metricsWithLabels.length).toBe(1);
    });
  });

  describe('Metric Reset', () => {
    /**
     * Test resetting a specific metric
     */
    it('should reset a specific metric successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.increment('test.counter', 5);
      metricsCollector.resetMetric('test.counter');

      const metric = metricsCollector.getMetric('test.counter');
      expect(metric?.values.length).toBe(0);
    });

    /**
     * Test resetting all metrics
     */
    it('should reset all metrics successfully', () => {
      const definition1: MetricDefinition = {
        name: 'test.counter1',
        type: MetricType.COUNTER,
        description: 'Test counter 1',
        labels: [],
      };

      const definition2: MetricDefinition = {
        name: 'test.counter2',
        type: MetricType.COUNTER,
        description: 'Test counter 2',
        labels: [],
      };

      metricsCollector.registerMetric(definition1);
      metricsCollector.registerMetric(definition2);
      metricsCollector.increment('test.counter1', 5);
      metricsCollector.increment('test.counter2', 10);

      metricsCollector.resetAll();

      const metric1 = metricsCollector.getMetric('test.counter1');
      const metric2 = metricsCollector.getMetric('test.counter2');
      expect(metric1?.values.length).toBe(0);
      expect(metric2?.values.length).toBe(0);
    });
  });

  describe('Timer', () => {
    /**
     * Test creating a timer
     */
    it('should create a timer successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.timer',
        type: MetricType.HISTOGRAM,
        description: 'Test timer metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      const timer = metricsCollector.createTimer('test.timer');

      expect(timer).toBeDefined();
      expect(timer.start).toBeDefined();
      expect(timer.stop).toBeDefined();
      expect(timer.elapsed).toBeDefined();
    });

    /**
     * Test timer stop records timing
     */
    it('should record timing when timer stops', () => {
      const definition: MetricDefinition = {
        name: 'test.timer',
        type: MetricType.HISTOGRAM,
        description: 'Test timer metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      const timer = metricsCollector.createTimer('test.timer');

      timer.start();
      const duration = timer.stop();

      expect(duration).toBeGreaterThanOrEqual(0);

      const metric = metricsCollector.getMetric('test.timer');
      expect(metric?.values.length).toBe(1);
    });
  });

  describe('Performance Metrics', () => {
    /**
     * Test recording performance metrics
     */
    it('should record performance metrics successfully', () => {
      const performanceMetrics: PerformanceMetrics = {
        operation: 'read',
        startTime: new Date(),
        endTime: new Date(),
        duration: 100,
        cpuTime: 50,
        memoryUsage: {
          heapUsed: 1024,
          heapTotal: 2048,
          external: 0,
          arrayBuffers: 0,
        },
        cacheHitRate: 0.8,
        databaseCalls: 5,
      };

      metricsCollector.recordPerformance('read', performanceMetrics);

      const opMetrics = metricsCollector.getOperationMetrics('read');
      expect(opMetrics.totalCount).toBe(1);
    });

    /**
     * Test getting operation metrics
     */
    it('should get operation metrics successfully', () => {
      const performanceMetrics: PerformanceMetrics = {
        operation: 'read',
        startTime: new Date(),
        endTime: new Date(),
        duration: 100,
        cpuTime: 50,
        memoryUsage: {
          heapUsed: 1024,
          heapTotal: 2048,
          external: 0,
          arrayBuffers: 0,
        },
        cacheHitRate: 0.8,
        databaseCalls: 5,
      };

      metricsCollector.recordPerformance('read', performanceMetrics);

      const opMetrics = metricsCollector.getOperationMetrics('read');
      expect(opMetrics.operation).toBe('read');
      expect(opMetrics.totalCount).toBe(1);
    });

    /**
     * Test getting all operation metrics
     */
    it('should get all operation metrics successfully', () => {
      const performanceMetrics1: PerformanceMetrics = {
        operation: 'read',
        startTime: new Date(),
        endTime: new Date(),
        duration: 100,
        cpuTime: 50,
        memoryUsage: {
          heapUsed: 1024,
          heapTotal: 2048,
          external: 0,
          arrayBuffers: 0,
        },
        cacheHitRate: 0.8,
        databaseCalls: 5,
      };

      const performanceMetrics2: PerformanceMetrics = {
        operation: 'write',
        startTime: new Date(),
        endTime: new Date(),
        duration: 150,
        cpuTime: 75,
        memoryUsage: {
          heapUsed: 1024,
          heapTotal: 2048,
          external: 0,
          arrayBuffers: 0,
        },
        cacheHitRate: 0.7,
        databaseCalls: 10,
      };

      metricsCollector.recordPerformance('read', performanceMetrics1);
      metricsCollector.recordPerformance('write', performanceMetrics2);

      const allOpMetrics = metricsCollector.getAllOperationMetrics();
      expect(allOpMetrics.size).toBe(2);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enabled: false,
        sampleRate: 0.5,
      };

      metricsCollector.setConfig(newConfig);
      const config = metricsCollector.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.sampleRate).toBe(0.5);
    });

    /**
     * Test partial config update
     */
    it('should update partial configuration', () => {
      metricsCollector.setConfig({ enableProfiling: true });
      const config = metricsCollector.getConfig();

      expect(config.enableProfiling).toBe(true);
      expect(config.enabled).toBe(true);
    });
  });

  describe('Export Metrics', () => {
    /**
     * Test exporting metrics to JSON
     */
    it('should export metrics to JSON successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.increment('test.counter', 5);

      const exported = metricsCollector.exportMetrics('json');

      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
      expect(exported).toContain('test.counter');
    });

    /**
     * Test exporting metrics to Prometheus format
     */
    it('should export metrics to Prometheus format successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.increment('test.counter', 5);

      const exported = metricsCollector.exportMetrics('prometheus');

      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
      expect(exported).toContain('test.counter');
    });

    /**
     * Test exporting metrics to CSV format
     */
    it('should export metrics to CSV format successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.increment('test.counter', 5);

      const exported = metricsCollector.exportMetrics('csv');

      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
      expect(exported).toContain('test.counter');
    });
  });

  describe('Clear', () => {
    /**
     * Test clearing all metrics
     */
    it('should clear all metrics successfully', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.increment('test.counter', 5);

      metricsCollector.clear();

      expect(metricsCollector.getMetricCount()).toBe(0);
    });
  });

  describe('Metric Count', () => {
    /**
     * Test getting metric count
     */
    it('should return correct metric count', () => {
      const definition1: MetricDefinition = {
        name: 'test.counter1',
        type: MetricType.COUNTER,
        description: 'Test counter 1',
        labels: [],
      };

      const definition2: MetricDefinition = {
        name: 'test.counter2',
        type: MetricType.COUNTER,
        description: 'Test counter 2',
        labels: [],
      };

      metricsCollector.registerMetric(definition1);
      metricsCollector.registerMetric(definition2);

      expect(metricsCollector.getMetricCount()).toBe(2);
    });
  });

  describe('Has Metric', () => {
    /**
     * Test checking if metric exists
     */
    it('should return true when metric exists', () => {
      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);

      expect(metricsCollector.hasMetric('test.counter')).toBe(true);
    });

    /**
     * Test checking if metric does not exist
     */
    it('should return false when metric does not exist', () => {
      expect(metricsCollector.hasMetric('nonexistent')).toBe(false);
    });
  });

  describe('Edge Cases', () {
    /**
     * Test recording when metrics disabled
     */
    it('should not record when metrics disabled', () => {
      metricsCollector.setConfig({ enabled: false });

      const definition: MetricDefinition = {
        name: 'test.counter',
        type: MetricType.COUNTER,
        description: 'Test counter metric',
        labels: [],
      };

      metricsCollector.registerMetric(definition);
      metricsCollector.increment('test.counter', 5);

      const metric = metricsCollector.getMetric('test.counter');
      expect(metric?.values.length).toBe(0);
    });

    /**
     * Test recording to unregistered metric does nothing
     */
    it('should not record to unregistered metric', () => {
      metricsCollector.increment('nonexistent', 5);

      const metric = metricsCollector.getMetric('nonexistent');
      expect(metric).toBeUndefined();
    });
  });
});
