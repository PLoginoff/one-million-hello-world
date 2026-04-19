/**
 * Metrics Tests
 */

import { InMemoryMetricsCollector, MetricsRegistry, TimingDecorator } from '../../metrics';

describe('InMemoryMetricsCollector', () => {
  let collector: InMemoryMetricsCollector;

  beforeEach(() => {
    collector = new InMemoryMetricsCollector();
  });

  describe('Counter', () => {
    it('should increment counter', () => {
      collector.increment('test');
      collector.increment('test', 5);
      expect(collector.aggregateCounter('test')).toBe(6);
    });

    it('should decrement counter', () => {
      collector.decrement('test');
      collector.decrement('test', 3);
      expect(collector.aggregateCounter('test')).toBe(-4);
    });
  });

  describe('Gauge', () => {
    it('should set gauge value', () => {
      collector.gauge('test', 10);
      collector.gauge('test', 20);
      expect(collector.getLatestGauge('test')).toBe(20);
    });
  });

  describe('Timing', () => {
    it('should record timing', () => {
      collector.timing('test', 100);
      collector.timing('test', 200);
      expect(collector.averageTiming('test')).toBe(150);
    });
  });

  describe('Histogram', () => {
    it('should record histogram value', () => {
      collector.histogram('test', 10);
      collector.histogram('test', 20);
      expect(collector.getMetricsByName('test')).toHaveLength(2);
    });
  });

  describe('Statistics', () => {
    it('should calculate stats', () => {
      collector.increment('test', 10);
      collector.increment('test', 20);
      collector.increment('test', 30);
      const stats = collector.getStats('test');
      expect(stats.count).toBe(3);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(30);
      expect(stats.avg).toBe(20);
      expect(stats.sum).toBe(60);
    });
  });

  describe('Management', () => {
    it('should get all metrics', () => {
      collector.increment('test1');
      collector.gauge('test2', 10);
      expect(collector.getMetrics()).toHaveLength(2);
    });

    it('should get metrics by name', () => {
      collector.increment('test');
      collector.increment('test');
      expect(collector.getMetricsByName('test')).toHaveLength(2);
    });

    it('should clear all metrics', () => {
      collector.increment('test');
      collector.clear();
      expect(collector.getMetrics()).toHaveLength(0);
    });
  });
});

describe('MetricsRegistry', () => {
  it('should register collector', () => {
    const registry = MetricsRegistry.getInstance();
    const collector = new InMemoryMetricsCollector();
    registry.register('test', collector);
    expect(registry.get('test')).toBe(collector);
  });

  it('should get or create default collector', () => {
    const registry = MetricsRegistry.getInstance();
    const collector = registry.getOrCreateDefault('default');
    expect(collector).toBeInstanceOf(InMemoryMetricsCollector);
  });

  it('should return same instance', () => {
    const instance1 = MetricsRegistry.getInstance();
    const instance2 = MetricsRegistry.getInstance();
    expect(instance1).toBe(instance2);
  });
});

describe('TimingDecorator', () => {
  it('should time sync function', () => {
    const collector = new InMemoryMetricsCollector();
    const decorator = new TimingDecorator(collector, 'test');
    const result = decorator.timeSync(() => 42);
    expect(result).toBe(42);
    expect(collector.getMetricsByName('test')).toHaveLength(1);
  });

  it('should time async function', async () => {
    const collector = new InMemoryMetricsCollector();
    const decorator = new TimingDecorator(collector, 'test');
    const result = await decorator.timeAsync(async () => 42);
    expect(result).toBe(42);
    expect(collector.getMetricsByName('test')).toHaveLength(1);
  });
});
