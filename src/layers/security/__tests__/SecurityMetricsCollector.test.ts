/**
 * Security Metrics Collector Unit Tests
 */

import { SecurityMetricsCollector } from '../metrics/SecurityMetricsCollector';
import { SecurityStatistics } from '../statistics/SecurityStatistics';

describe('SecurityMetricsCollector', () => {
  let statistics: SecurityStatistics;
  let collector: SecurityMetricsCollector;

  beforeEach(() => {
    statistics = new SecurityStatistics();
    collector = new SecurityMetricsCollector(statistics);
  });

  it('should collect metrics', () => {
    statistics.recordSuccessfulAuthentication(30);
    statistics.recordSuccessfulAuthentication(20);

    const metrics = collector.collect();
    expect(metrics.securityAuthTotal).toBe(2);
    expect(metrics.securityAuthSuccessfulTotal).toBe(2);
  });

  it('should increment collection count', () => {
    collector.collect();
    collector.collect();
    expect(collector.getCollectionCount()).toBe(2);
  });

  it('should produce Prometheus samples', () => {
    statistics.recordSuccessfulAuthentication(30);
    const samples = collector.collectAsPrometheusSamples();
    const names = samples.map((s) => s.name);
    expect(names).toContain('security_auth_total');
    expect(names).toContain('security_avg_auth_time_ms');
  });

  it('should generate Prometheus text', () => {
    statistics.recordSuccessfulAuthentication(30);
    const text = collector.toPrometheusString();
    expect(text).toContain('# HELP security_auth_total');
    expect(text).toContain('# TYPE security_auth_total counter');
  });
});
