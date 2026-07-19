import { EtlPipelineMetricsCollector } from '../statistics/EtlPipelineMetricsCollector';

export interface EtlPipelinePrometheusMetrics {
  etl_pipeline_executions_total: number;
  etl_pipeline_successful_executions_total: number;
  etl_pipeline_failed_executions_total: number;
  etl_pipeline_avg_execution_time_ms: number;
  etl_pipeline_active_operations: number;
  collectedAt: number;
}

export interface EtlPipelineMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class EtlPipelinePrometheusMetricsCollector {
  private readonly _collector: EtlPipelineMetricsCollector;
  private _collectionCount: number;

  constructor(collector: EtlPipelineMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): EtlPipelinePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      etl_pipeline_executions_total: m.executionCount,
      etl_pipeline_successful_executions_total: m.successCount,
      etl_pipeline_failed_executions_total: m.failureCount,
      etl_pipeline_avg_execution_time_ms: m.averageExecutionTime,
      etl_pipeline_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): EtlPipelineMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'etl_pipeline_executions_total', value: m.etl_pipeline_executions_total, labels: {}, timestamp: ts },
      {
        name: 'etl_pipeline_successful_executions_total',
        value: m.etl_pipeline_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'etl_pipeline_failed_executions_total',
        value: m.etl_pipeline_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'etl_pipeline_avg_execution_time_ms',
        value: m.etl_pipeline_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'etl_pipeline_active_operations', value: m.etl_pipeline_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP etl_pipeline_executions_total Total executions',
      '# TYPE etl_pipeline_executions_total counter',
      '# HELP etl_pipeline_successful_executions_total Total successful executions',
      '# TYPE etl_pipeline_successful_executions_total counter',
      '# HELP etl_pipeline_failed_executions_total Total failed executions',
      '# TYPE etl_pipeline_failed_executions_total counter',
      '# HELP etl_pipeline_avg_execution_time_ms Average execution time in ms',
      '# TYPE etl_pipeline_avg_execution_time_ms gauge',
      '# HELP etl_pipeline_active_operations Current active operations',
      '# TYPE etl_pipeline_active_operations gauge',
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
