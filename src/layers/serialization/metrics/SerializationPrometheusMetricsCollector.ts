import { SerializationMetricsCollector } from '../statistics/SerializationMetricsCollector';

export interface SerializationPrometheusMetrics {
  serialization_executions_total: number;
  serialization_successful_executions_total: number;
  serialization_failed_executions_total: number;
  serialization_avg_execution_time_ms: number;
  serialization_active_operations: number;
  collectedAt: number;
}

export interface SerializationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SerializationPrometheusMetricsCollector {
  private readonly _collector: SerializationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SerializationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SerializationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      serialization_executions_total: m.executionCount,
      serialization_successful_executions_total: m.successCount,
      serialization_failed_executions_total: m.failureCount,
      serialization_avg_execution_time_ms: m.averageExecutionTime,
      serialization_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SerializationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'serialization_executions_total', value: m.serialization_executions_total, labels: {}, timestamp: ts },
      {
        name: 'serialization_successful_executions_total',
        value: m.serialization_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'serialization_failed_executions_total',
        value: m.serialization_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'serialization_avg_execution_time_ms',
        value: m.serialization_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'serialization_active_operations', value: m.serialization_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP serialization_executions_total Total executions',
      '# TYPE serialization_executions_total counter',
      '# HELP serialization_successful_executions_total Total successful executions',
      '# TYPE serialization_successful_executions_total counter',
      '# HELP serialization_failed_executions_total Total failed executions',
      '# TYPE serialization_failed_executions_total counter',
      '# HELP serialization_avg_execution_time_ms Average execution time in ms',
      '# TYPE serialization_avg_execution_time_ms gauge',
      '# HELP serialization_active_operations Current active operations',
      '# TYPE serialization_active_operations gauge',
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
