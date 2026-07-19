/**
 * Rate Limiting Metrics Collector Unit Tests
 */

import { RateLimitingMetricsCollector } from '../metrics/RateLimitingMetricsCollector';
import { RateLimitStatistics } from '../statistics/RateLimitStatistics';

describe('RateLimitingMetricsCollector', () => {
  let statistics: RateLimitStatistics;
  let collector: RateLimitingMetricsCollector;

  beforeEach(() => {
    statistics = new RateLimitStatistics();
    collector = new RateLimitingMetricsCollector(statistics);
  });

  it('should collect metrics', () => {
    statistics.recordAllowedRequest(5);
    statistics.recordDeniedRequest();

    const metrics = collector.collect();
    expect(metrics.rateLimitRequestsTotal).toBe(2);
    expect(metrics.rateLimitAllowedTotal).toBe(1);
    expect(metrics.rateLimitDeniedTotal).toBe(1);
  });

  it('should increment collection count', () => {
    collector.collect();
    collector.collect();
    expect(collector.getCollectionCount()).toBe(2);
  });

  it('should produce Prometheus samples', () => {
    statistics.recordAllowedRequest(5);
    const samples = collector.collectAsPrometheusSamples();
    const names = samples.map((s) => s.name);
    expect(names).toContain('rate_limit_requests_total');
    expect(names).toContain('rate_limit_avg_response_time_ms');
  });

  it('should generate Prometheus text', () => {
    statistics.recordAllowedRequest(5);
    const text = collector.toPrometheusString();
    expect(text).toContain('# HELP rate_limit_requests_total');
    expect(text).toContain('# TYPE rate_limit_requests_total counter');
  });
});
