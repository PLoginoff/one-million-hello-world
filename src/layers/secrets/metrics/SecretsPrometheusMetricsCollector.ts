import { SecretsMetricsCollector } from '../statistics/SecretsMetricsCollector';

export interface SecretsPrometheusMetrics {
  secrets_executions_total: number;
  secrets_successful_executions_total: number;
  secrets_failed_executions_total: number;
  secrets_avg_execution_time_ms: number;
  secrets_active_operations: number;
  collectedAt: number;
}

export interface SecretsMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SecretsPrometheusMetricsCollector {
  private readonly _collector: SecretsMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SecretsMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SecretsPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      secrets_executions_total: m.executionCount,
      secrets_successful_executions_total: m.successCount,
      secrets_failed_executions_total: m.failureCount,
      secrets_avg_execution_time_ms: m.averageExecutionTime,
      secrets_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SecretsMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'secrets_executions_total', value: m.secrets_executions_total, labels: {}, timestamp: ts },
      {
        name: 'secrets_successful_executions_total',
        value: m.secrets_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'secrets_failed_executions_total', value: m.secrets_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'secrets_avg_execution_time_ms', value: m.secrets_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'secrets_active_operations', value: m.secrets_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP secrets_executions_total Total executions',
      '# TYPE secrets_executions_total counter',
      '# HELP secrets_successful_executions_total Total successful executions',
      '# TYPE secrets_successful_executions_total counter',
      '# HELP secrets_failed_executions_total Total failed executions',
      '# TYPE secrets_failed_executions_total counter',
      '# HELP secrets_avg_execution_time_ms Average execution time in ms',
      '# TYPE secrets_avg_execution_time_ms gauge',
      '# HELP secrets_active_operations Current active operations',
      '# TYPE secrets_active_operations gauge',
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
