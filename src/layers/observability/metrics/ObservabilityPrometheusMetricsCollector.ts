import { ObservabilityMetricsCollector } from '../statistics/ObservabilityMetricsCollector';

export interface ObservabilityPrometheusMetrics {
  observability_executions_total: number;
  observability_successful_executions_total: number;
  observability_failed_executions_total: number;
  observability_avg_execution_time_ms: number;
  observability_active_operations: number;
  collectedAt: number;
}

export interface ObservabilityMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ObservabilityPrometheusMetricsCollector {
  private readonly _collector: ObservabilityMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ObservabilityMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ObservabilityPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      observability_executions_total: m.executionCount,
      observability_successful_executions_total: m.successCount,
      observability_failed_executions_total: m.failureCount,
      observability_avg_execution_time_ms: m.averageExecutionTime,
      observability_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ObservabilityMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'observability_executions_total', value: m.observability_executions_total, labels: {}, timestamp: ts },
      {
        name: 'observability_successful_executions_total',
        value: m.observability_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'observability_failed_executions_total',
        value: m.observability_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'observability_avg_execution_time_ms',
        value: m.observability_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'observability_active_operations', value: m.observability_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP observability_executions_total Total executions',
      '# TYPE observability_executions_total counter',
      '# HELP observability_successful_executions_total Total successful executions',
      '# TYPE observability_successful_executions_total counter',
      '# HELP observability_failed_executions_total Total failed executions',
      '# TYPE observability_failed_executions_total counter',
      '# HELP observability_avg_execution_time_ms Average execution time in ms',
      '# TYPE observability_avg_execution_time_ms gauge',
      '# HELP observability_active_operations Current active operations',
      '# TYPE observability_active_operations gauge',
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
