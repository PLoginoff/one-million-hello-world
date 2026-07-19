import { FeatureFlagsMetricsCollector } from '../statistics/FeatureFlagsMetricsCollector';

export interface FeatureFlagsPrometheusMetrics {
  feature_flags_executions_total: number;
  feature_flags_successful_executions_total: number;
  feature_flags_failed_executions_total: number;
  feature_flags_avg_execution_time_ms: number;
  feature_flags_active_operations: number;
  collectedAt: number;
}

export interface FeatureFlagsMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class FeatureFlagsPrometheusMetricsCollector {
  private readonly _collector: FeatureFlagsMetricsCollector;
  private _collectionCount: number;

  constructor(collector: FeatureFlagsMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): FeatureFlagsPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      feature_flags_executions_total: m.executionCount,
      feature_flags_successful_executions_total: m.successCount,
      feature_flags_failed_executions_total: m.failureCount,
      feature_flags_avg_execution_time_ms: m.averageExecutionTime,
      feature_flags_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): FeatureFlagsMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'feature_flags_executions_total', value: m.feature_flags_executions_total, labels: {}, timestamp: ts },
      {
        name: 'feature_flags_successful_executions_total',
        value: m.feature_flags_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'feature_flags_failed_executions_total',
        value: m.feature_flags_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'feature_flags_avg_execution_time_ms',
        value: m.feature_flags_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'feature_flags_active_operations', value: m.feature_flags_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP feature_flags_executions_total Total executions',
      '# TYPE feature_flags_executions_total counter',
      '# HELP feature_flags_successful_executions_total Total successful executions',
      '# TYPE feature_flags_successful_executions_total counter',
      '# HELP feature_flags_failed_executions_total Total failed executions',
      '# TYPE feature_flags_failed_executions_total counter',
      '# HELP feature_flags_avg_execution_time_ms Average execution time in ms',
      '# TYPE feature_flags_avg_execution_time_ms gauge',
      '# HELP feature_flags_active_operations Current active operations',
      '# TYPE feature_flags_active_operations gauge',
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
