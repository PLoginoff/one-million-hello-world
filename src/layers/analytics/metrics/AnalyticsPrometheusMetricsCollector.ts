import { AnalyticsMetricsCollector } from '../statistics/AnalyticsMetricsCollector';

export interface AnalyticsPrometheusMetrics {
  analytics_executions_total: number;
  analytics_successful_executions_total: number;
  analytics_failed_executions_total: number;
  analytics_avg_execution_time_ms: number;
  analytics_active_operations: number;
  collectedAt: number;
}

export interface AnalyticsMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class AnalyticsPrometheusMetricsCollector {
  private readonly _collector: AnalyticsMetricsCollector;
  private _collectionCount: number;

  constructor(collector: AnalyticsMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): AnalyticsPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      analytics_executions_total: m.executionCount,
      analytics_successful_executions_total: m.successCount,
      analytics_failed_executions_total: m.failureCount,
      analytics_avg_execution_time_ms: m.averageExecutionTime,
      analytics_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): AnalyticsMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'analytics_executions_total', value: m.analytics_executions_total, labels: {}, timestamp: ts },
      {
        name: 'analytics_successful_executions_total',
        value: m.analytics_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'analytics_failed_executions_total',
        value: m.analytics_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'analytics_avg_execution_time_ms', value: m.analytics_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'analytics_active_operations', value: m.analytics_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP analytics_executions_total Total executions',
      '# TYPE analytics_executions_total counter',
      '# HELP analytics_successful_executions_total Total successful executions',
      '# TYPE analytics_successful_executions_total counter',
      '# HELP analytics_failed_executions_total Total failed executions',
      '# TYPE analytics_failed_executions_total counter',
      '# HELP analytics_avg_execution_time_ms Average execution time in ms',
      '# TYPE analytics_avg_execution_time_ms gauge',
      '# HELP analytics_active_operations Current active operations',
      '# TYPE analytics_active_operations gauge',
    ];

    for (const s of samples) {
      lines.push(s.name + ' ' + s.value + ' ' + s.timestamp);
    }

    return lines.join('\n') + '\n';
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
