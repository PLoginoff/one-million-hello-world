/**
 * Validation Metrics Collector Unit Tests
 */

import { ValidationMetricsCollector } from '../metrics/ValidationMetricsCollector';
import { ValidationStatistics } from '../statistics/ValidationStatistics';

describe('ValidationMetricsCollector', () => {
  let statistics: ValidationStatistics;
  let collector: ValidationMetricsCollector;

  beforeEach(() => {
    statistics = new ValidationStatistics();
    collector = new ValidationMetricsCollector(statistics);
  });

  it('should collect metrics', () => {
    statistics.recordSuccess(5);
    statistics.recordSuccess(3);

    const metrics = collector.collect();
    expect(metrics.validationTotalValidations).toBe(2);
    expect(metrics.validationSuccessfulTotal).toBe(2);
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
    expect(names).toContain('validation_total');
    expect(names).toContain('validation_avg_time_ms');
  });

  it('should generate Prometheus text', () => {
    statistics.recordSuccess(5);
    const text = collector.toPrometheusString();
    expect(text).toContain('# HELP validation_total');
    expect(text).toContain('# TYPE validation_total counter');
  });
});
