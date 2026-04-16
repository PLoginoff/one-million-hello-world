/**
 * Metrics Layer Tests
 * 
 * Comprehensive test suite for Metrics implementation.
 * Tests metric collection, aggregation, export, and statistics.
 */

import { Metrics } from '../implementations/Metrics';
import { IMetrics } from '../interfaces/IMetrics';
import {
  MetricType,
  MetricUnit,
} from '../types/metrics-types';

describe('Metrics', () => {
  let metrics: Metrics;

  beforeEach(() => {
    // Initialize Metrics before each test
    metrics = new Metrics();
  });

  describe('Initialization', () => {
    /**
     * Test that Metrics initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = metrics.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.defaultUnit).toBe(MetricUnit.MILLISECONDS);
    });
  });

  describe('Counter Metrics', () => {
    /**
     * Test incrementing a counter
     */
    it('should increment a counter successfully', () => {
      metrics.increment('test.counter', 1);
      const value = metrics.get('test.counter');

      expect(value).toBe(1);
    });

    /**
     * Test incrementing counter by custom value
     */
    it('should increment counter by custom value', () => {
      metrics.increment('test.counter', 5);
      const value = metrics.get('test.counter');

      expect(value).toBe(5);
    });

    /**
     * Test decrementing a counter
     */
    it('should decrement a counter successfully', () => {
      metrics.increment('test.counter', 10);
      metrics.decrement('test.counter', 3);
      const value = metrics.get('test.counter');

      expect(value).toBe(7);
    });
  });

  describe('Gauge Metrics', () => {
    /**
     * Test setting a gauge value
     */
    it('should set a gauge value successfully', () => {
      metrics.gauge('test.gauge', 42);
      const value = metrics.get('test.gauge');

      expect(value).toBe(42);
    });

    /**
     * Test updating gauge value
     */
    it('should update gauge value successfully', () => {
      metrics.gauge('test.gauge', 42);
      metrics.gauge('test.gauge', 100);
      const value = metrics.get('test.gauge');

      expect(value).toBe(100);
    });
  });

  describe('Histogram Metrics', () => {
    /**
     * Test recording a histogram value
     */
    it('should record a histogram value successfully', () => {
      metrics.histogram('test.histogram', 50);
      const value = metrics.get('test.histogram');

      expect(value).toBeDefined();
    });

    /**
     * Test recording multiple histogram values
     */
    it('should record multiple histogram values successfully', () => {
      metrics.histogram('test.histogram', 50);
      metrics.histogram('test.histogram', 60);
      metrics.histogram('test.histogram', 70);

      const value = metrics.get('test.histogram');
      expect(value).toBeDefined();
    });
  });

  describe('Timer Metrics', () => {
    /**
     * Test timing a function
     */
    it('should time a function successfully', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      };

      await metrics.time('test.timer', fn);
      const value = metrics.get('test.timer');

      expect(value).toBeDefined();
      expect(value).toBeGreaterThan(0);
    });
  });

  describe('Metric Retrieval', () => {
    /**
     * Test getting a metric value
     */
    it('should get a metric value successfully', () => {
      metrics.increment('test.counter', 5);
      const value = metrics.get('test.counter');

      expect(value).toBe(5);
    });

    /**
     * Test getting all metrics
     */
    it('should get all metrics successfully', () => {
      metrics.increment('test.counter1', 5);
      metrics.increment('test.counter2', 10);

      const allMetrics = metrics.getAll();

      expect(allMetrics.size).toBeGreaterThan(0);
    });

    /**
     * Test getting metrics by type
     */
    it('should get metrics by type successfully', () => {
      metrics.increment('test.counter', 5);
      metrics.gauge('test.gauge', 42);

      const counterMetrics = metrics.getByType(MetricType.COUNTER);
      expect(counterMetrics.size).toBeGreaterThan(0);
    });
  });

  describe('Metric Reset', () => {
    /**
     * Test resetting a specific metric
     */
    it('should reset a specific metric successfully', () => {
      metrics.increment('test.counter', 5);
      metrics.reset('test.counter');
      const value = metrics.get('test.counter');

      expect(value).toBe(0);
    });

    /**
     * Test resetting all metrics
     */
    it('should reset all metrics successfully', () => {
      metrics.increment('test.counter1', 5);
      metrics.increment('test.counter2', 10);

      metrics.resetAll();
      const allMetrics = metrics.getAll();

      expect(allMetrics.size).toBe(0);
    });
  });

  describe('Metric Export', ()   => {
    /**
     * Test exporting metrics to JSON
     */
    it('should export metrics to JSON successfully', () => {
      metrics.increment('test.counter', 5);
      metrics.gauge('test.gauge', 42);

      const exported = metrics.export();

      expect(exported).toBeDefined();
      expect(typeof exported).toBe('object');
    });
  });

  describe('Metric Tags', () => {
    /**
     * Test recording metric with tags
     */
    it('should record metric with tags successfully', () => {
      metrics.increment('test.counter', 1, { operation: 'read' });
      const value = metrics.get('test.counter');

      expect(value).toBeDefined();
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enabled: false,
        defaultUnit: MetricUnit.SECONDS,
      };

      metrics.setConfig(newConfig);
      const config = metrics.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.defaultUnit).toBe(MetricUnit.SECONDS);
    });
  });
});
