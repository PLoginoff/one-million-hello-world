/**
 * Middleware Metrics Collector Unit Tests
 */

import { MiddlewareMetricsCollector } from '../metrics/MiddlewareMetricsCollector';
import { MiddlewareStatistics } from '../statistics/MiddlewareStatistics';

describe('MiddlewareMetricsCollector', () => {
  let statistics: MiddlewareStatistics;
  let collector: MiddlewareMetricsCollector;

  beforeEach(() => {
    statistics = new MiddlewareStatistics();
    collector = new MiddlewareMetricsCollector(statistics);
  });

  it('should collect metrics', () => {
    statistics.recordSuccess(5);
    statistics.recordSuccess(3);

    const metrics = collector.collect();
    expect(metrics.middlewareExecutionsTotal).toBe(2);
    expect(metrics.middlewareSuccessfulExecutionsTotal).toBe(2);
  });

  it('should increment collection count', () => {
    collector.collect();
    collector.collect();
    expect(collector.getCollectionCount()).toBe(2);
  });

  it('should produce Prometheus samples', () => {
    statistics.recordSuccess(5);
    const samples = collector.collectAsPrometheusSamples();
    const names = samples.map((s) => s.name);
    expect(names).toContain('middleware_executions_total');
    expect(names).toContain('middleware_avg_execution_time_ms');
  });

  it('should generate Prometheus text', () => {
    statistics.recordSuccess(5);
    const text = collector.toPrometheusString();
    expect(text).toContain('# HELP middleware_executions_total');
    expect(text).toContain('# TYPE middleware_executions_total counter');
  });
});
