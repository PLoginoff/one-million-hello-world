import { BatchProcessingMetricsCollector } from '../statistics/BatchProcessingMetricsCollector';

export interface BatchProcessingPrometheusMetrics {
  batch_processing_executions_total: number;
  batch_processing_successful_executions_total: number;
  batch_processing_failed_executions_total: number;
  batch_processing_avg_execution_time_ms: number;
  batch_processing_active_operations: number;
  collectedAt: number;
}

export interface BatchProcessingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class BatchProcessingPrometheusMetricsCollector {
  private readonly _collector: BatchProcessingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: BatchProcessingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): BatchProcessingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      batch_processing_executions_total: m.executionCount,
      batch_processing_successful_executions_total: m.successCount,
      batch_processing_failed_executions_total: m.failureCount,
      batch_processing_avg_execution_time_ms: m.averageExecutionTime,
      batch_processing_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): BatchProcessingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'batch_processing_executions_total',
        value: m.batch_processing_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'batch_processing_successful_executions_total',
        value: m.batch_processing_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'batch_processing_failed_executions_total',
        value: m.batch_processing_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'batch_processing_avg_execution_time_ms',
        value: m.batch_processing_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'batch_processing_active_operations',
        value: m.batch_processing_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP batch_processing_executions_total Total executions',
      '# TYPE batch_processing_executions_total counter',
      '# HELP batch_processing_successful_executions_total Total successful executions',
      '# TYPE batch_processing_successful_executions_total counter',
      '# HELP batch_processing_failed_executions_total Total failed executions',
      '# TYPE batch_processing_failed_executions_total counter',
      '# HELP batch_processing_avg_execution_time_ms Average execution time in ms',
      '# TYPE batch_processing_avg_execution_time_ms gauge',
      '# HELP batch_processing_active_operations Current active operations',
      '# TYPE batch_processing_active_operations gauge',
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
