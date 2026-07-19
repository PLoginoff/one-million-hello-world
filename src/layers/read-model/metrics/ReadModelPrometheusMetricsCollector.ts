import { ReadModelMetricsCollector } from '../statistics/ReadModelMetricsCollector';

export interface ReadModelPrometheusMetrics {
  read_model_executions_total: number;
  read_model_successful_executions_total: number;
  read_model_failed_executions_total: number;
  read_model_avg_execution_time_ms: number;
  read_model_active_operations: number;
  collectedAt: number;
}

export interface ReadModelMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ReadModelPrometheusMetricsCollector {
  private readonly _collector: ReadModelMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ReadModelMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ReadModelPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      read_model_executions_total: m.executionCount,
      read_model_successful_executions_total: m.successCount,
      read_model_failed_executions_total: m.failureCount,
      read_model_avg_execution_time_ms: m.averageExecutionTime,
      read_model_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ReadModelMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'read_model_executions_total', value: m.read_model_executions_total, labels: {}, timestamp: ts },
      {
        name: 'read_model_successful_executions_total',
        value: m.read_model_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'read_model_failed_executions_total',
        value: m.read_model_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'read_model_avg_execution_time_ms',
        value: m.read_model_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'read_model_active_operations', value: m.read_model_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP read_model_executions_total Total executions',
      '# TYPE read_model_executions_total counter',
      '# HELP read_model_successful_executions_total Total successful executions',
      '# TYPE read_model_successful_executions_total counter',
      '# HELP read_model_failed_executions_total Total failed executions',
      '# TYPE read_model_failed_executions_total counter',
      '# HELP read_model_avg_execution_time_ms Average execution time in ms',
      '# TYPE read_model_avg_execution_time_ms gauge',
      '# HELP read_model_active_operations Current active operations',
      '# TYPE read_model_active_operations gauge',
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
