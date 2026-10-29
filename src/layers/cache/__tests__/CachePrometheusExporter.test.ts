/**
 * Cache Prometheus Exporter Tests
 */

import { CacheMetricsCollector } from '../metrics/CacheMetricsCollector';
import { CachePrometheusExporter, PrometheusMetricBuilder, PrometheusExporters } from '../metrics/CachePrometheusExporter';
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';

describe('CachePrometheusExporter', () => {
  let collector: BasicStatisticsCollector;
  let metricsCollector: CacheMetricsCollector;
  let exporter: CachePrometheusExporter;

  beforeEach(() => {
    collector = new BasicStatisticsCollector();
    metricsCollector = new CacheMetricsCollector(collector);
    exporter = new CachePrometheusExporter(metricsCollector);
  });

  afterEach(() => {
    metricsCollector.shutdown();
  });

  describe('export', () => {
    it('should export Prometheus format', () => {
      collector.recordHit();
      collector.recordMiss();
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);

      const output = exporter.export();
      expect(output).toContain('cache_hits_total');
      expect(output).toContain('cache_misses_total');
      expect(output).toContain('cache_hit_rate');
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should export samples', () => {
      collector.recordHit();
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);

      const samples = exporter.exportSamples();
      expect(samples.length).toBeGreaterThan(0);
      expect(samples.some(s => s.name === 'cache_hits_total')).toBe(true);
    });

    it('should export as object', () => {
      collector.recordHit();
      metricsCollector.recordExecution('lru', { operation: 'get', level: 'L1' }, 5, true, true);

      const obj = exporter.exportObject();
      expect(obj.cacheHitsTotal).toBe(1);
      expect(obj.samples).toBeDefined();
      expect(obj.exportCount).toBe(1);
    });
  });

  describe('customization', () => {
    it('should create exporter with custom prefix', () => {
      const customExporter = exporter.withPrefix('mycache');
      collector.recordHit();
      const output = customExporter.export();
      expect(output).toContain('mycache_hits_total');
    });

    it('should create exporter with custom labels', () => {
      const customExporter = exporter.withLabels({ env: 'test', region: 'us-east' });
      collector.recordHit();
      const output = customExporter.export();
      expect(output).toContain('env="test"');
      expect(output).toContain('region="us-east"');
    });
  });

  describe('pre-configured exporters', () => {
    it('should create standard exporter', () => {
      const standardExporter = PrometheusExporters.standard(metricsCollector);
      expect(standardExporter).toBeInstanceOf(CachePrometheusExporter);
    });

    it('should create multi-tenant exporter', () => {
      const tenantExporter = PrometheusExporters.multiTenant(metricsCollector, 'tenant1');
      collector.recordHit();
      const output = tenantExporter.export();
      expect(output).toContain('cache_tenant1_hits_total');
      expect(output).toContain('tenant="tenant1"');
    });

    it('should create kubernetes exporter', () => {
      const k8sExporter = PrometheusExporters.kubernetes(metricsCollector, 'pod-1', 'default');
      collector.recordHit();
      const output = k8sExporter.export();
      expect(output).toContain('pod="pod-1"');
      expect(output).toContain('namespace="default"');
    });

    it('should create minimal exporter', () => {
      const minimalExporter = PrometheusExporters.minimal(metricsCollector);
      collector.recordHit();
      const output = minimalExporter.export();
      expect(output).not.toContain('# HELP');
      expect(output).not.toContain('# TYPE');
    });
  });
});

describe('PrometheusMetricBuilder', () => {
  let builder: PrometheusMetricBuilder;

  beforeEach(() => {
    builder = new PrometheusMetricBuilder();
  });

  it('should build counter metric', () => {
    builder.counter('requests_total', 'Total requests', 100, { method: 'GET' });
    const output = builder.build();
    expect(output).toContain('requests_total{method="GET"} 100');
    expect(output).toContain('# TYPE requests_total counter');
  });

  it('should build gauge metric', () => {
    builder.gauge('cache_size', 'Current cache size', 50, { level: 'L1' });
    const output = builder.build();
    expect(output).toContain('cache_size{level="L1"} 50');
    expect(output).toContain('# TYPE cache_size gauge');
  });

  it('should build histogram metric', () => {
    builder.histogram('request_duration', 'Request duration', [
      { le: '0.1', value: 50 },
      { le: '0.5', value: 80 },
      { le: '1.0', value: 95 },
      { le: '+Inf', value: 100 },
    ], { handler: 'api' });

    const output = builder.build();
    expect(output).toContain('request_duration_bucket{handler="api",le="0.1"} 50');
    expect(output).toContain('request_duration_bucket{handler="api",le="+Inf"} 100');
    expect(output).toContain('request_duration_sum{handler="api"}');
    expect(output).toContain('request_duration_count{handler="api"}');
  });

  it('should build summary metric', () => {
    builder.summary('request_duration', 'Request duration', [
      { quantile: '0.5', value: 0.1 },
      { quantile: '0.9', value: 0.5 },
      { quantile: '0.99', value: 1.0 },
    ], 100, 1000, { handler: 'api' });

    const output = builder.build();
    expect(output).toContain('request_duration{handler="api",quantile="0.5"} 0.1');
    expect(output).toContain('request_duration_sum{handler="api"} 100');
    expect(output).toContain('request_duration_count{handler="api"} 1000');
  });

  it('should reset builder', () => {
    builder.counter('test', 'Test', 1);
    builder.reset();
    const output = builder.build();
    expect(output).toBe('\n');
  });
});