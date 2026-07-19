import { CompressionMetricsCollector } from '../statistics/CompressionMetricsCollector';

export interface CompressionPrometheusMetrics {
  compression_executions_total: number;
  compression_successful_executions_total: number;
  compression_failed_executions_total: number;
  compression_avg_execution_time_ms: number;
  compression_active_operations: number;
  collectedAt: number;
}

export interface CompressionMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class CompressionPrometheusMetricsCollector {
  private readonly _collector: CompressionMetricsCollector;
  private _collectionCount: number;

  constructor(collector: CompressionMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): CompressionPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      compression_executions_total: m.executionCount,
      compression_successful_executions_total: m.successCount,
      compression_failed_executions_total: m.failureCount,
      compression_avg_execution_time_ms: m.averageExecutionTime,
      compression_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): CompressionMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'compression_executions_total', value: m.compression_executions_total, labels: {}, timestamp: ts },
      {
        name: 'compression_successful_executions_total',
        value: m.compression_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'compression_failed_executions_total',
        value: m.compression_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'compression_avg_execution_time_ms',
        value: m.compression_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'compression_active_operations', value: m.compression_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP compression_executions_total Total executions',
      '# TYPE compression_executions_total counter',
      '# HELP compression_successful_executions_total Total successful executions',
      '# TYPE compression_successful_executions_total counter',
      '# HELP compression_failed_executions_total Total failed executions',
      '# TYPE compression_failed_executions_total counter',
      '# HELP compression_avg_execution_time_ms Average execution time in ms',
      '# TYPE compression_avg_execution_time_ms gauge',
      '# HELP compression_active_operations Current active operations',
      '# TYPE compression_active_operations gauge',
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
