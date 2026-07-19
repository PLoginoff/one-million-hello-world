import { DataTransformationMetricsCollector } from '../statistics/DataTransformationMetricsCollector';

export interface DataTransformationPrometheusMetrics {
  data_transformation_executions_total: number;
  data_transformation_successful_executions_total: number;
  data_transformation_failed_executions_total: number;
  data_transformation_avg_execution_time_ms: number;
  data_transformation_active_operations: number;
  collectedAt: number;
}

export interface DataTransformationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class DataTransformationPrometheusMetricsCollector {
  private readonly _collector: DataTransformationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: DataTransformationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): DataTransformationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      data_transformation_executions_total: m.executionCount,
      data_transformation_successful_executions_total: m.successCount,
      data_transformation_failed_executions_total: m.failureCount,
      data_transformation_avg_execution_time_ms: m.averageExecutionTime,
      data_transformation_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): DataTransformationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'data_transformation_executions_total',
        value: m.data_transformation_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'data_transformation_successful_executions_total',
        value: m.data_transformation_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'data_transformation_failed_executions_total',
        value: m.data_transformation_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'data_transformation_avg_execution_time_ms',
        value: m.data_transformation_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'data_transformation_active_operations',
        value: m.data_transformation_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP data_transformation_executions_total Total executions',
      '# TYPE data_transformation_executions_total counter',
      '# HELP data_transformation_successful_executions_total Total successful executions',
      '# TYPE data_transformation_successful_executions_total counter',
      '# HELP data_transformation_failed_executions_total Total failed executions',
      '# TYPE data_transformation_failed_executions_total counter',
      '# HELP data_transformation_avg_execution_time_ms Average execution time in ms',
      '# TYPE data_transformation_avg_execution_time_ms gauge',
      '# HELP data_transformation_active_operations Current active operations',
      '# TYPE data_transformation_active_operations gauge',
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
