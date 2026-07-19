/**
 * Cache Metrics Collector Unit Tests
 */

import { CacheMetricsCollector } from '../metrics/CacheMetricsCollector';
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';

describe('CacheMetricsCollector', () => {
  let collector: BasicStatisticsCollector;
  let metricsCollector: CacheMetricsCollector;

  beforeEach(() => {
    collector = new BasicStatisticsCollector();
    metricsCollector = new CacheMetricsCollector(collector);
  });

  it('should collect metrics', () => {
    collector.recordHit();
    collector.recordHit();
    collector.recordMiss();
    collector.updateSize(10);

    const metrics = metricsCollector.collect();
    expect(metrics.cacheHitsTotal).toBe(2);
    expect(metrics.cacheMissesTotal).toBe(1);
    expect(metrics.cacheSize).toBe(10);
  });

  it('should increment collection count', () => {
    metricsCollector.collect();
    metricsCollector.collect();
    expect(metricsCollector.getCollectionCount()).toBe(2);
  });

  it('should produce Prometheus samples', () => {
    collector.recordHit();
    const samples = metricsCollector.collectAsPrometheusSamples();
    const names = samples.map((s) => s.name);
    expect(names).toContain('cache_hits_total');
    expect(names).toContain('cache_hit_rate');
    expect(names).toContain('cache_size');
  });

  it('should generate Prometheus text', () => {
    collector.recordHit();
    const text = metricsCollector.toPrometheusString();
    expect(text).toContain('# HELP cache_hits_total');
    expect(text).toContain('# TYPE cache_hits_total counter');
  });
});
