import { ThrottlingMetricsCollector } from '../statistics/ThrottlingMetricsCollector';

export interface ThrottlingPrometheusMetrics {
  throttling_executions_total: number;
  throttling_successful_executions_total: number;
  throttling_failed_executions_total: number;
  throttling_avg_execution_time_ms: number;
  throttling_active_operations: number;
  collectedAt: number;
}

export interface ThrottlingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ThrottlingPrometheusMetricsCollector {
  private readonly _collector: ThrottlingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ThrottlingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ThrottlingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      throttling_executions_total: m.executionCount,
      throttling_successful_executions_total: m.successCount,
      throttling_failed_executions_total: m.failureCount,
      throttling_avg_execution_time_ms: m.averageExecutionTime,
      throttling_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ThrottlingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'throttling_executions_total', value: m.throttling_executions_total, labels: {}, timestamp: ts },
      {
        name: 'throttling_successful_executions_total',
        value: m.throttling_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'throttling_failed_executions_total',
        value: m.throttling_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'throttling_avg_execution_time_ms',
        value: m.throttling_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'throttling_active_operations', value: m.throttling_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP throttling_executions_total Total executions',
      '# TYPE throttling_executions_total counter',
      '# HELP throttling_successful_executions_total Total successful executions',
      '# TYPE throttling_successful_executions_total counter',
      '# HELP throttling_failed_executions_total Total failed executions',
      '# TYPE throttling_failed_executions_total counter',
      '# HELP throttling_avg_execution_time_ms Average execution time in ms',
      '# TYPE throttling_avg_execution_time_ms gauge',
      '# HELP throttling_active_operations Current active operations',
      '# TYPE throttling_active_operations gauge',
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
