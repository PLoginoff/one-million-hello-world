import { LocalizationMetricsCollector } from '../statistics/LocalizationMetricsCollector';

export interface LocalizationPrometheusMetrics {
  localization_executions_total: number;
  localization_successful_executions_total: number;
  localization_failed_executions_total: number;
  localization_avg_execution_time_ms: number;
  localization_active_operations: number;
  collectedAt: number;
}

export interface LocalizationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class LocalizationPrometheusMetricsCollector {
  private readonly _collector: LocalizationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: LocalizationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): LocalizationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      localization_executions_total: m.executionCount,
      localization_successful_executions_total: m.successCount,
      localization_failed_executions_total: m.failureCount,
      localization_avg_execution_time_ms: m.averageExecutionTime,
      localization_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): LocalizationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'localization_executions_total', value: m.localization_executions_total, labels: {}, timestamp: ts },
      {
        name: 'localization_successful_executions_total',
        value: m.localization_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'localization_failed_executions_total',
        value: m.localization_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'localization_avg_execution_time_ms',
        value: m.localization_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'localization_active_operations', value: m.localization_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP localization_executions_total Total executions',
      '# TYPE localization_executions_total counter',
      '# HELP localization_successful_executions_total Total successful executions',
      '# TYPE localization_successful_executions_total counter',
      '# HELP localization_failed_executions_total Total failed executions',
      '# TYPE localization_failed_executions_total counter',
      '# HELP localization_avg_execution_time_ms Average execution time in ms',
      '# TYPE localization_avg_execution_time_ms gauge',
      '# HELP localization_active_operations Current active operations',
      '# TYPE localization_active_operations gauge',
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
