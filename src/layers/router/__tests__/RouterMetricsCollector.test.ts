/**
 * Router Metrics Collector Unit Tests
 */

import { RouterMetricsCollector } from '../metrics/RouterMetricsCollector';
import { RouterStatistics } from '../statistics/RouterStatistics';

describe('RouterMetricsCollector', () => {
  let statistics: RouterStatistics;
  let collector: RouterMetricsCollector;

  beforeEach(() => {
    statistics = new RouterStatistics();
    collector = new RouterMetricsCollector(statistics);
  });

  it('should collect metrics from statistics', () => {
    statistics.recordSuccess(5, '/hello', 'GET');
    statistics.recordSuccess(3, '/hello', 'GET');

    const metrics = collector.collect();
    expect(metrics.routerRequestsTotal).toBe(2);
    expect(metrics.routerSuccessfulRoutesTotal).toBe(2);
  });

  it('should increment collection count', () => {
    collector.collect();
    collector.collect();
    expect(collector.getCollectionCount()).toBe(2);
  });

  it('should produce Prometheus samples', () => {
    statistics.recordSuccess(5, '/hello', 'GET');
    const samples = collector.collectAsPrometheusSamples();
    const names = samples.map((s) => s.name);
    expect(names).toContain('router_requests_total');
    expect(names).toContain('router_avg_routing_time_ms');
  });

  it('should include per-path and per-method samples', () => {
    statistics.recordSuccess(5, '/hello', 'GET');
    statistics.recordSuccess(3, '/world', 'POST');

    const samples = collector.collectAsPrometheusSamples();
    const byPath = samples.filter((s) => s.name === 'router_requests_by_path');
    const byMethod = samples.filter((s) => s.name === 'router_requests_by_method');
    expect(byPath.length).toBeGreaterThan(0);
    expect(byMethod.length).toBeGreaterThan(0);
  });

  it('should generate Prometheus text', () => {
    statistics.recordSuccess(5, '/hello', 'GET');
    const text = collector.toPrometheusString();
    expect(text).toContain('# HELP router_requests_total');
    expect(text).toContain('# TYPE router_requests_total counter');
  });
});
