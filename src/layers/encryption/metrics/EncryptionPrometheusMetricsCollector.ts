import { EncryptionMetricsCollector } from '../statistics/EncryptionMetricsCollector';

export interface EncryptionPrometheusMetrics {
  encryption_executions_total: number;
  encryption_successful_executions_total: number;
  encryption_failed_executions_total: number;
  encryption_avg_execution_time_ms: number;
  encryption_active_operations: number;
  collectedAt: number;
}

export interface EncryptionMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class EncryptionPrometheusMetricsCollector {
  private readonly _collector: EncryptionMetricsCollector;
  private _collectionCount: number;

  constructor(collector: EncryptionMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): EncryptionPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      encryption_executions_total: m.executionCount,
      encryption_successful_executions_total: m.successCount,
      encryption_failed_executions_total: m.failureCount,
      encryption_avg_execution_time_ms: m.averageExecutionTime,
      encryption_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): EncryptionMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'encryption_executions_total', value: m.encryption_executions_total, labels: {}, timestamp: ts },
      {
        name: 'encryption_successful_executions_total',
        value: m.encryption_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'encryption_failed_executions_total',
        value: m.encryption_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'encryption_avg_execution_time_ms',
        value: m.encryption_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'encryption_active_operations', value: m.encryption_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP encryption_executions_total Total executions',
      '# TYPE encryption_executions_total counter',
      '# HELP encryption_successful_executions_total Total successful executions',
      '# TYPE encryption_successful_executions_total counter',
      '# HELP encryption_failed_executions_total Total failed executions',
      '# TYPE encryption_failed_executions_total counter',
      '# HELP encryption_avg_execution_time_ms Average execution time in ms',
      '# TYPE encryption_avg_execution_time_ms gauge',
      '# HELP encryption_active_operations Current active operations',
      '# TYPE encryption_active_operations gauge',
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
