/**
 * Middleware Metrics Collector
 */

import { MiddlewareStatistics } from '../statistics/MiddlewareStatistics';

export interface MiddlewareMetrics {
  middlewareExecutionsTotal: number;
  middlewareSuccessfulExecutionsTotal: number;
  middlewareFailedExecutionsTotal: number;
  middlewareAverageExecutionTimeMs: number;
  middlewareMostExecuted: Array<{ id: string; count: number }>;
  collectedAt: number;
}

export interface MiddlewareMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MiddlewareMetricsCollector {
  private readonly _statistics: MiddlewareStatistics;
  private _collectionCount: number;

  constructor(statistics: MiddlewareStatistics) {
    this._statistics = statistics;
    this._collectionCount = 0;
  }

  collect(): MiddlewareMetrics {
    const stats = this._statistics.getStats();
    this._collectionCount++;
    return {
      middlewareExecutionsTotal: stats.totalExecutions,
      middlewareSuccessfulExecutionsTotal: stats.successfulExecutions,
      middlewareFailedExecutionsTotal: stats.failedExecutions,
      middlewareAverageExecutionTimeMs: stats.averageExecutionTime,
      middlewareMostExecuted: stats.mostExecutedMiddlewares.map((m) => ({ id: m.id, count: m.count })),
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): MiddlewareMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    const samples: MiddlewareMetricSample[] = [
      { name: 'middleware_executions_total', value: m.middlewareExecutionsTotal, labels: {}, timestamp: ts },
      {
        name: 'middleware_successful_executions_total',
        value: m.middlewareSuccessfulExecutionsTotal,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'middleware_failed_executions_total',
        value: m.middlewareFailedExecutionsTotal,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'middleware_avg_execution_time_ms',
        value: m.middlewareAverageExecutionTimeMs,
        labels: {},
        timestamp: ts,
      },
    ];

    for (const mw of m.middlewareMostExecuted) {
      samples.push({
        name: 'middleware_executions_by_middleware',
        value: mw.count,
        labels: { middleware_id: mw.id },
        timestamp: ts,
      });
    }

    return samples;
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP middleware_executions_total Total middleware executions',
      '# TYPE middleware_executions_total counter',
      '# HELP middleware_successful_executions_total Total successful middleware executions',
      '# TYPE middleware_successful_executions_total counter',
      '# HELP middleware_failed_executions_total Total failed middleware executions',
      '# TYPE middleware_failed_executions_total counter',
      '# HELP middleware_avg_execution_time_ms Average middleware execution time in ms',
      '# TYPE middleware_avg_execution_time_ms gauge',
      '# HELP middleware_executions_by_middleware Executions per middleware',
      '# TYPE middleware_executions_by_middleware counter',
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
