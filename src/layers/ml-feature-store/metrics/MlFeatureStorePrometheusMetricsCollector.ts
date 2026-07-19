import { MlFeatureStoreMetricsCollector } from '../statistics/MlFeatureStoreMetricsCollector';

export interface MlFeatureStorePrometheusMetrics {
  ml_feature_store_executions_total: number;
  ml_feature_store_successful_executions_total: number;
  ml_feature_store_failed_executions_total: number;
  ml_feature_store_avg_execution_time_ms: number;
  ml_feature_store_active_operations: number;
  collectedAt: number;
}

export interface MlFeatureStoreMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MlFeatureStorePrometheusMetricsCollector {
  private readonly _collector: MlFeatureStoreMetricsCollector;
  private _collectionCount: number;

  constructor(collector: MlFeatureStoreMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): MlFeatureStorePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      ml_feature_store_executions_total: m.executionCount,
      ml_feature_store_successful_executions_total: m.successCount,
      ml_feature_store_failed_executions_total: m.failureCount,
      ml_feature_store_avg_execution_time_ms: m.averageExecutionTime,
      ml_feature_store_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): MlFeatureStoreMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'ml_feature_store_executions_total',
        value: m.ml_feature_store_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'ml_feature_store_successful_executions_total',
        value: m.ml_feature_store_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'ml_feature_store_failed_executions_total',
        value: m.ml_feature_store_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'ml_feature_store_avg_execution_time_ms',
        value: m.ml_feature_store_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'ml_feature_store_active_operations',
        value: m.ml_feature_store_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP ml_feature_store_executions_total Total executions',
      '# TYPE ml_feature_store_executions_total counter',
      '# HELP ml_feature_store_successful_executions_total Total successful executions',
      '# TYPE ml_feature_store_successful_executions_total counter',
      '# HELP ml_feature_store_failed_executions_total Total failed executions',
      '# TYPE ml_feature_store_failed_executions_total counter',
      '# HELP ml_feature_store_avg_execution_time_ms Average execution time in ms',
      '# TYPE ml_feature_store_avg_execution_time_ms gauge',
      '# HELP ml_feature_store_active_operations Current active operations',
      '# TYPE ml_feature_store_active_operations gauge',
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
