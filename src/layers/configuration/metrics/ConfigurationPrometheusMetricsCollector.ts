import { ConfigurationMetricsCollector } from '../statistics/ConfigurationMetricsCollector';

export interface ConfigurationPrometheusMetrics {
  configuration_executions_total: number;
  configuration_successful_executions_total: number;
  configuration_failed_executions_total: number;
  configuration_avg_execution_time_ms: number;
  configuration_active_operations: number;
  collectedAt: number;
}

export interface ConfigurationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ConfigurationPrometheusMetricsCollector {
  private readonly _collector: ConfigurationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ConfigurationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ConfigurationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      configuration_executions_total: m.executionCount,
      configuration_successful_executions_total: m.successCount,
      configuration_failed_executions_total: m.failureCount,
      configuration_avg_execution_time_ms: m.averageExecutionTime,
      configuration_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ConfigurationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'configuration_executions_total', value: m.configuration_executions_total, labels: {}, timestamp: ts },
      {
        name: 'configuration_successful_executions_total',
        value: m.configuration_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'configuration_failed_executions_total',
        value: m.configuration_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'configuration_avg_execution_time_ms',
        value: m.configuration_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'configuration_active_operations', value: m.configuration_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP configuration_executions_total Total executions',
      '# TYPE configuration_executions_total counter',
      '# HELP configuration_successful_executions_total Total successful executions',
      '# TYPE configuration_successful_executions_total counter',
      '# HELP configuration_failed_executions_total Total failed executions',
      '# TYPE configuration_failed_executions_total counter',
      '# HELP configuration_avg_execution_time_ms Average execution time in ms',
      '# TYPE configuration_avg_execution_time_ms gauge',
      '# HELP configuration_active_operations Current active operations',
      '# TYPE configuration_active_operations gauge',
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
