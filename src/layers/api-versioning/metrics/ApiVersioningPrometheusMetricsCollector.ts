import { ApiVersioningMetricsCollector } from '../statistics/ApiVersioningMetricsCollector';

export interface ApiVersioningPrometheusMetrics {
  api_versioning_executions_total: number;
  api_versioning_successful_executions_total: number;
  api_versioning_failed_executions_total: number;
  api_versioning_avg_execution_time_ms: number;
  api_versioning_active_operations: number;
  collectedAt: number;
}

export interface ApiVersioningMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ApiVersioningPrometheusMetricsCollector {
  private readonly _collector: ApiVersioningMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ApiVersioningMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ApiVersioningPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      api_versioning_executions_total: m.executionCount,
      api_versioning_successful_executions_total: m.successCount,
      api_versioning_failed_executions_total: m.failureCount,
      api_versioning_avg_execution_time_ms: m.averageExecutionTime,
      api_versioning_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ApiVersioningMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'api_versioning_executions_total', value: m.api_versioning_executions_total, labels: {}, timestamp: ts },
      {
        name: 'api_versioning_successful_executions_total',
        value: m.api_versioning_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'api_versioning_failed_executions_total',
        value: m.api_versioning_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'api_versioning_avg_execution_time_ms',
        value: m.api_versioning_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'api_versioning_active_operations',
        value: m.api_versioning_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP api_versioning_executions_total Total executions',
      '# TYPE api_versioning_executions_total counter',
      '# HELP api_versioning_successful_executions_total Total successful executions',
      '# TYPE api_versioning_successful_executions_total counter',
      '# HELP api_versioning_failed_executions_total Total failed executions',
      '# TYPE api_versioning_failed_executions_total counter',
      '# HELP api_versioning_avg_execution_time_ms Average execution time in ms',
      '# TYPE api_versioning_avg_execution_time_ms gauge',
      '# HELP api_versioning_active_operations Current active operations',
      '# TYPE api_versioning_active_operations gauge',
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
