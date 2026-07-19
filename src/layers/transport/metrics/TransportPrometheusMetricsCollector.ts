import { TransportMetricsCollector } from '../statistics/TransportMetricsCollector';

export interface TransportPrometheusMetrics {
  transport_executions_total: number;
  transport_successful_executions_total: number;
  transport_failed_executions_total: number;
  transport_avg_execution_time_ms: number;
  transport_active_operations: number;
  collectedAt: number;
}

export interface TransportMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class TransportPrometheusMetricsCollector {
  private readonly _collector: TransportMetricsCollector;
  private _collectionCount: number;

  constructor(collector: TransportMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): TransportPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      transport_executions_total: m.executionCount,
      transport_successful_executions_total: m.successCount,
      transport_failed_executions_total: m.failureCount,
      transport_avg_execution_time_ms: m.averageExecutionTime,
      transport_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): TransportMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'transport_executions_total', value: m.transport_executions_total, labels: {}, timestamp: ts },
      {
        name: 'transport_successful_executions_total',
        value: m.transport_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'transport_failed_executions_total',
        value: m.transport_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'transport_avg_execution_time_ms', value: m.transport_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'transport_active_operations', value: m.transport_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP transport_executions_total Total executions',
      '# TYPE transport_executions_total counter',
      '# HELP transport_successful_executions_total Total successful executions',
      '# TYPE transport_successful_executions_total counter',
      '# HELP transport_failed_executions_total Total failed executions',
      '# TYPE transport_failed_executions_total counter',
      '# HELP transport_avg_execution_time_ms Average execution time in ms',
      '# TYPE transport_avg_execution_time_ms gauge',
      '# HELP transport_active_operations Current active operations',
      '# TYPE transport_active_operations gauge',
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
