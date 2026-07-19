import { WriteModelMetricsCollector } from '../statistics/WriteModelMetricsCollector';

export interface WriteModelPrometheusMetrics {
  write_model_executions_total: number;
  write_model_successful_executions_total: number;
  write_model_failed_executions_total: number;
  write_model_avg_execution_time_ms: number;
  write_model_active_operations: number;
  collectedAt: number;
}

export interface WriteModelMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class WriteModelPrometheusMetricsCollector {
  private readonly _collector: WriteModelMetricsCollector;
  private _collectionCount: number;

  constructor(collector: WriteModelMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): WriteModelPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      write_model_executions_total: m.executionCount,
      write_model_successful_executions_total: m.successCount,
      write_model_failed_executions_total: m.failureCount,
      write_model_avg_execution_time_ms: m.averageExecutionTime,
      write_model_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): WriteModelMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'write_model_executions_total', value: m.write_model_executions_total, labels: {}, timestamp: ts },
      {
        name: 'write_model_successful_executions_total',
        value: m.write_model_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'write_model_failed_executions_total',
        value: m.write_model_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'write_model_avg_execution_time_ms',
        value: m.write_model_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'write_model_active_operations', value: m.write_model_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP write_model_executions_total Total executions',
      '# TYPE write_model_executions_total counter',
      '# HELP write_model_successful_executions_total Total successful executions',
      '# TYPE write_model_successful_executions_total counter',
      '# HELP write_model_failed_executions_total Total failed executions',
      '# TYPE write_model_failed_executions_total counter',
      '# HELP write_model_avg_execution_time_ms Average execution time in ms',
      '# TYPE write_model_avg_execution_time_ms gauge',
      '# HELP write_model_active_operations Current active operations',
      '# TYPE write_model_active_operations gauge',
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
