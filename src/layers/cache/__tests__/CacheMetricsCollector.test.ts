/**
 * Cache Metrics Collector Tests
 */

import { CacheMetricsCollector } from '../metrics/CacheMetricsCollector';
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';
import { InMemoryCacheMetricsCollector } from '../strategies/MetricsCacheStrategy';

describe('CacheMetricsCollector', () => {
  let collector: BasicStatisticsCollector;
  let metricsCollector: CacheMetricsCollector;

  beforeEach(() => {
    collector = new BasicStatisticsCollector();
    metricsCollector = new CacheMetricsCollector(collector);
  });

  afterEach(() => {
    metricsCollector.shutdown();
  });

  describe('recordExecution', () => {
    it('should record execution metrics', () => {
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 10, true, false);
      metricsCollector.recordExecution('lru', { operation: 'set', level: 'L1' }, 3, true, false);

      const metrics = metricsCollector.getMetrics('lru');
      expect(metrics).not.toBeNull();
      expect(metrics!.totalExecutions).toBe(3);
      expect(metrics!.successfulExecutions).toBe(3);
      expect(metrics!.hitRate).toBeCloseTo(1/3, 1);
    });

    it('should track per-operation metrics', () => {
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 10, true, false);
      metricsCollector.recordExecution('lru', { operation: 'set', level: 'L1' }, 3, true, false);

      const getMetrics = metricsCollector.getOperationMetrics('get');
      expect(getMetrics).not.toBeNull();
      expect(getMetrics!.totalExecutions).toBe(2);

      const setMetrics = metricsCollector.getOperationMetrics('set');
      expect(setMetrics).not.toBeNull();
      expect(setMetrics!.totalExecutions).toBe(1);
    });

    it('should track per-level metrics', () => {
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L2' }, 10, true, false);

      const l1Metrics = metricsCollector.getLevelMetrics('L1');
      expect(l1Metrics).not.toBeNull();
      expect(l1Metrics!.totalExecutions).toBe(1);

      const l2Metrics = metricsCollector.getLevelMetrics('L2');
      expect(l2Metrics).not.toBeNull();
      expect(l2Metrics!.totalExecutions).toBe(1);
    });
  });

  describe('collect', () => {
    it('should collect combined metrics', () => {
      collector.recordHit();
      collector.recordHit();
      collector.recordMiss();

      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 10, true, false);

      const metrics = metricsCollector.collect();
      expect(metrics.cacheHitsTotal).toBe(2);
      expect(metrics.cacheMissesTotal).toBe(1);
      expect(metrics.cacheHitRate).toBeCloseTo(2/3, 1);
      expect(metrics.avgLatencyMs).toBeGreaterThan(0);
    });
  });

  describe('prometheus export', () => {
    it('should export Prometheus format', () => {
      collector.recordHit();
      collector.recordHit();
      collector.recordMiss();

      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);

      const prometheusString = metricsCollector.toPrometheusString();
      expect(prometheusString).toContain('cache_hits_total');
      expect(prometheusString).toContain('cache_misses_total');
      expect(prometheusString).toContain('cache_hit_rate');
      expect(prometheusString).toContain('cache_avg_latency_ms');
      expect(prometheusString).toContain('cache_strategy_executions_total');
    });

    it('should export as samples', () => {
      collector.recordHit();
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);

      const samples = metricsCollector.collectAsPrometheusSamples();
      expect(samples.length).toBeGreaterThan(0);
      expect(samples.some(s => s.name === 'cache_hits_total')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset strategy metrics', () => {
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);
      metricsCollector.resetMetrics('lru');
      const metrics = metricsCollector.getMetrics('lru');
      expect(metrics).toBeNull();
    });

    it('should reset all metrics', () => {
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);
      metricsCollector.recordExecution('lfu', { operation: 'get', level: 'L1' }, 5, true, true);
      metricsCollector.resetAllMetrics();
      expect(metricsCollector.getMetrics('lru')).toBeNull();
      expect(metricsCollector.getMetrics('lfu')).toBeNull();
    });
  });

  describe('uptime and collection count', () => {
    it('should track uptime', () => {
      const uptime = metricsCollector.getUptimeMs();
      expect(uptime).toBeGreaterThanOrEqual(0);
    });

    it('should track collection count', () => {
      metricsCollector.collect();
      metricsCollector.collect();
      expect(metricsCollector.getCollectionCount()).toBe(2);
    });
  });
});

describe('InMemoryCacheMetricsCollector', () => {
  let collector: InMemoryCacheMetricsCollector;

  beforeEach(() => {
    collector = new InMemoryCacheMetricsCollector();
  });

  it('should record and retrieve metrics', () => {
    collector.recordExecution('test', { operation: 'get', level: 'L1' }, 10, true, true);
    collector.recordExecution('test', { operation: 'get', level: 'L1' }, 20, true, false);

    const metrics = collector.getMetrics('test');
    expect(metrics).not.toBeNull();
    expect(metrics!.totalExecutions).toBe(2);
    expect(metrics!.averageExecutionTimeMs).toBe(15);
  });

  it('should calculate percentiles', () => {
    for (let i = 1; i <= 100; i++) {
      collector.recordExecution('test', { operation: 'get', level: 'L1' }, i, true, i <= 80);
    }

    const metrics = collector.getMetrics('test');
    expect(metrics).not.toBeNull();
    expect(metrics!.percentiles.p50).toBeLessThanOrEqual(50);
    expect(metrics!.percentiles.p90).toBeLessThanOrEqual(90);
    expect(metrics!.percentiles.p95).toBeLessThanOrEqual(95);
    expect(metrics!.percentiles.p99).toBeLessThanOrEqual(99);
  });

  it('should track by operation', () => {
    collector.recordExecution('test', { operation: 'get', level: 'L1' }, 10, true, true);
    collector.recordExecution('test', { operation: 'set', level: 'L1' }, 20, true, false);

    const metrics = collector.getMetrics('test');
    expect(metrics!.byOperation.get).toBeDefined();
    expect(metrics!.byOperation.set).toBeDefined();
  });

  it('should track by level', () => {
    collector.recordExecution('test', { operation: 'get', level: 'L1' }, 10, true, true);
    collector.recordExecution('test', { operation: 'get', level: 'L2' }, 20, true, false);

    const metrics = collector.getMetrics('test');
    expect(metrics!.byLevel.L1).toBeDefined();
    expect(metrics!.byLevel.L2).toBeDefined();
  });
});