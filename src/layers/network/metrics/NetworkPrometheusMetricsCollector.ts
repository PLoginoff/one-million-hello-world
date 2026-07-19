import { NetworkMetricsCollector } from '../statistics/NetworkMetricsCollector';

export interface NetworkPrometheusMetrics {
  network_executions_total: number;
  network_successful_executions_total: number;
  network_failed_executions_total: number;
  network_avg_execution_time_ms: number;
  network_active_operations: number;
  collectedAt: number;
}

export interface NetworkMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class NetworkPrometheusMetricsCollector {
  private readonly _collector: NetworkMetricsCollector;
  private _collectionCount: number;

  constructor(collector: NetworkMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): NetworkPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      network_executions_total: m.executionCount,
      network_successful_executions_total: m.successCount,
      network_failed_executions_total: m.failureCount,
      network_avg_execution_time_ms: m.averageExecutionTime,
      network_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): NetworkMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'network_executions_total', value: m.network_executions_total, labels: {}, timestamp: ts },
      {
        name: 'network_successful_executions_total',
        value: m.network_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'network_failed_executions_total', value: m.network_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'network_avg_execution_time_ms', value: m.network_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'network_active_operations', value: m.network_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP network_executions_total Total executions',
      '# TYPE network_executions_total counter',
      '# HELP network_successful_executions_total Total successful executions',
      '# TYPE network_successful_executions_total counter',
      '# HELP network_failed_executions_total Total failed executions',
      '# TYPE network_failed_executions_total counter',
      '# HELP network_avg_execution_time_ms Average execution time in ms',
      '# TYPE network_avg_execution_time_ms gauge',
      '# HELP network_active_operations Current active operations',
      '# TYPE network_active_operations gauge',
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
