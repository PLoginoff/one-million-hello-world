/**
 * Service Metrics Collector Unit Tests
 */

import { ServiceMetricsCollector } from '../metrics/ServiceMetricsCollector';
import { ServiceStatistics } from '../statistics/ServiceStatistics';

describe('ServiceMetricsCollector', () => {
  let statistics: ServiceStatistics;
  let collector: ServiceMetricsCollector;

  beforeEach(() => {
    statistics = new ServiceStatistics();
    collector = new ServiceMetricsCollector(statistics);
  });

  it('should collect metrics from statistics', () => {
    statistics.recordSuccess(50, 'svc-1');
    statistics.recordSuccess(30, 'svc-1');
    statistics.recordFailure(20);

    const metrics = collector.collect();
    expect(metrics.serviceExecutionsTotal).toBe(3);
    expect(metrics.serviceSuccessfulExecutionsTotal).toBe(2);
    expect(metrics.serviceFailedExecutionsTotal).toBe(1);
    expect(metrics.serviceSuccessRate).toBeCloseTo(2 / 3, 5);
  });

  it('should increment collection count', () => {
    collector.collect();
    collector.collect();
    expect(collector.getCollectionCount()).toBe(2);
  });

  it('should produce Prometheus samples', () => {
    statistics.recordSuccess(50, 'svc-1');

    const samples = collector.collectAsPrometheusSamples();
    const names = samples.map((s) => s.name);
    expect(names).toContain('service_executions_total');
    expect(names).toContain('service_successful_executions_total');
    expect(names).toContain('service_avg_execution_time_ms');
  });

  it('should include per-service samples with labels', () => {
    statistics.recordSuccess(50, 'svc-1');
    statistics.recordSuccess(30, 'svc-2');

    const samples = collector.collectAsPrometheusSamples();
    const perService = samples.filter((s) => s.name === 'service_executions_by_service');
    expect(perService.length).toBe(2);
    expect(perService[0].labels.service_id).toBeDefined();
  });

  it('should generate valid Prometheus text', () => {
    statistics.recordSuccess(50, 'svc-1');

    const text = collector.toPrometheusString();
    expect(text).toContain('# HELP service_executions_total');
    expect(text).toContain('# TYPE service_executions_total counter');
    expect(text).toContain('service_executions_total');
  });
});
