/**
 * Repository Metrics Collector Unit Tests
 */

import { RepositoryMetricsCollector } from '../metrics/RepositoryMetricsCollector';
import { RepositoryStatistics } from '../statistics/RepositoryStatistics';

describe('RepositoryMetricsCollector', () => {
  let statistics: RepositoryStatistics;
  let collector: RepositoryMetricsCollector;

  beforeEach(() => {
    statistics = new RepositoryStatistics();
    collector = new RepositoryMetricsCollector(statistics);
  });

  it('should collect metrics from statistics', () => {
    statistics.recordSuccess(50, 'repo-1');
    statistics.recordSuccess(30, 'repo-1');

    const metrics = collector.collect();
    expect(metrics.repositoryQueriesTotal).toBe(2);
    expect(metrics.repositorySuccessfulQueriesTotal).toBe(2);
  });

  it('should increment collection count', () => {
    collector.collect();
    collector.collect();
    expect(collector.getCollectionCount()).toBe(2);
  });

  it('should produce Prometheus samples', () => {
    statistics.recordSuccess(50, 'repo-1');
    const samples = collector.collectAsPrometheusSamples();
    const names = samples.map((s) => s.name);
    expect(names).toContain('repository_queries_total');
    expect(names).toContain('repository_avg_query_time_ms');
  });

  it('should generate Prometheus text', () => {
    statistics.recordSuccess(50, 'repo-1');
    const text = collector.toPrometheusString();
    expect(text).toContain('# HELP repository_queries_total');
    expect(text).toContain('# TYPE repository_queries_total counter');
  });
});
