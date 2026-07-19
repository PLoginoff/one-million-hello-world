import { StreamProcessingMetricsCollector } from '../statistics/StreamProcessingMetricsCollector';

export interface StreamProcessingPrometheusMetrics {
  stream_processing_executions_total: number;
  stream_processing_successful_executions_total: number;
  stream_processing_failed_executions_total: number;
  stream_processing_avg_execution_time_ms: number;
  stream_processing_active_operations: number;
  collectedAt: number;
}

export interface StreamProcessingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class StreamProcessingPrometheusMetricsCollector {
  private readonly _collector: StreamProcessingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: StreamProcessingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): StreamProcessingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      stream_processing_executions_total: m.executionCount,
      stream_processing_successful_executions_total: m.successCount,
      stream_processing_failed_executions_total: m.failureCount,
      stream_processing_avg_execution_time_ms: m.averageExecutionTime,
      stream_processing_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): StreamProcessingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'stream_processing_executions_total',
        value: m.stream_processing_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'stream_processing_successful_executions_total',
        value: m.stream_processing_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'stream_processing_failed_executions_total',
        value: m.stream_processing_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'stream_processing_avg_execution_time_ms',
        value: m.stream_processing_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'stream_processing_active_operations',
        value: m.stream_processing_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP stream_processing_executions_total Total executions',
      '# TYPE stream_processing_executions_total counter',
      '# HELP stream_processing_successful_executions_total Total successful executions',
      '# TYPE stream_processing_successful_executions_total counter',
      '# HELP stream_processing_failed_executions_total Total failed executions',
      '# TYPE stream_processing_failed_executions_total counter',
      '# HELP stream_processing_avg_execution_time_ms Average execution time in ms',
      '# TYPE stream_processing_avg_execution_time_ms gauge',
      '# HELP stream_processing_active_operations Current active operations',
      '# TYPE stream_processing_active_operations gauge',
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
