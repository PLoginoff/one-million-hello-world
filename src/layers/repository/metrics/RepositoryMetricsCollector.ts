/**
 * Repository Metrics Collector
 *
 * Collects and exposes metrics for the repository layer.
 */

import { RepositoryStatistics } from '../statistics/RepositoryStatistics';

export interface RepositoryMetrics {
  repositoryQueriesTotal: number;
  repositorySuccessfulQueriesTotal: number;
  repositoryFailedQueriesTotal: number;
  repositoryAverageQueryTimeMs: number;
  repositoryMostQueried: Array<{ id: string; count: number }>;
  collectedAt: number;
}

export interface RepositoryMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class RepositoryMetricsCollector {
  private readonly _statistics: RepositoryStatistics;
  private _collectionCount: number;

  constructor(statistics: RepositoryStatistics) {
    this._statistics = statistics;
    this._collectionCount = 0;
  }

  collect(): RepositoryMetrics {
    const stats = this._statistics.getStats();
    this._collectionCount++;
    return {
      repositoryQueriesTotal: stats.totalQueries,
      repositorySuccessfulQueriesTotal: stats.successfulQueries,
      repositoryFailedQueriesTotal: stats.failedQueries,
      repositoryAverageQueryTimeMs: stats.averageQueryTime,
      repositoryMostQueried: stats.mostQueriedRepositories.map((r) => ({ id: r.id, count: r.count })),
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): RepositoryMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    const samples: RepositoryMetricSample[] = [
      { name: 'repository_queries_total', value: m.repositoryQueriesTotal, labels: {}, timestamp: ts },
      {
        name: 'repository_successful_queries_total',
        value: m.repositorySuccessfulQueriesTotal,
        labels: {},
        timestamp: ts,
      },
      { name: 'repository_failed_queries_total', value: m.repositoryFailedQueriesTotal, labels: {}, timestamp: ts },
      { name: 'repository_avg_query_time_ms', value: m.repositoryAverageQueryTimeMs, labels: {}, timestamp: ts },
    ];

    for (const repo of m.repositoryMostQueried) {
      samples.push({
        name: 'repository_queries_by_repo',
        value: repo.count,
        labels: { repository_id: repo.id },
        timestamp: ts,
      });
    }

    return samples;
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP repository_queries_total Total repository queries',
      '# TYPE repository_queries_total counter',
      '# HELP repository_successful_queries_total Total successful repository queries',
      '# TYPE repository_successful_queries_total counter',
      '# HELP repository_failed_queries_total Total failed repository queries',
      '# TYPE repository_failed_queries_total counter',
      '# HELP repository_avg_query_time_ms Average repository query time in ms',
      '# TYPE repository_avg_query_time_ms gauge',
      '# HELP repository_queries_by_repo Queries per repository',
      '# TYPE repository_queries_by_repo counter',
    ];

    for (const s of samples) {
      const labelStr =
        Object.keys(s.labels).length > 0
          ? '{' +
            Object.entries(s.labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',') +
            '}'
          : '';
      lines.push(`${s.name}${labelStr} ${s.value} ${s.timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
