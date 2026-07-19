import { RetryMetricsCollector } from '../statistics/RetryMetricsCollector';

export interface RetryPrometheusMetrics {
  retry_executions_total: number;
  retry_successful_executions_total: number;
  retry_failed_executions_total: number;
  retry_avg_execution_time_ms: number;
  retry_active_operations: number;
  collectedAt: number;
}

export interface RetryMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class RetryPrometheusMetricsCollector {
  private readonly _collector: RetryMetricsCollector;
  private _collectionCount: number;

  constructor(collector: RetryMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): RetryPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      retry_executions_total: m.executionCount,
      retry_successful_executions_total: m.successCount,
      retry_failed_executions_total: m.failureCount,
      retry_avg_execution_time_ms: m.averageExecutionTime,
      retry_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): RetryMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'retry_executions_total', value: m.retry_executions_total, labels: {}, timestamp: ts },
      {
        name: 'retry_successful_executions_total',
        value: m.retry_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'retry_failed_executions_total', value: m.retry_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'retry_avg_execution_time_ms', value: m.retry_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'retry_active_operations', value: m.retry_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP retry_executions_total Total executions',
      '# TYPE retry_executions_total counter',
      '# HELP retry_successful_executions_total Total successful executions',
      '# TYPE retry_successful_executions_total counter',
      '# HELP retry_failed_executions_total Total failed executions',
      '# TYPE retry_failed_executions_total counter',
      '# HELP retry_avg_execution_time_ms Average execution time in ms',
      '# TYPE retry_avg_execution_time_ms gauge',
      '# HELP retry_active_operations Current active operations',
      '# TYPE retry_active_operations gauge',
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
