import { Oauth2MetricsCollector } from '../statistics/Oauth2MetricsCollector';

export interface Oauth2PrometheusMetrics {
  oauth2_executions_total: number;
  oauth2_successful_executions_total: number;
  oauth2_failed_executions_total: number;
  oauth2_avg_execution_time_ms: number;
  oauth2_active_operations: number;
  collectedAt: number;
}

export interface Oauth2MetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class Oauth2PrometheusMetricsCollector {
  private readonly _collector: Oauth2MetricsCollector;
  private _collectionCount: number;

  constructor(collector: Oauth2MetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): Oauth2PrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      oauth2_executions_total: m.executionCount,
      oauth2_successful_executions_total: m.successCount,
      oauth2_failed_executions_total: m.failureCount,
      oauth2_avg_execution_time_ms: m.averageExecutionTime,
      oauth2_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): Oauth2MetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'oauth2_executions_total', value: m.oauth2_executions_total, labels: {}, timestamp: ts },
      {
        name: 'oauth2_successful_executions_total',
        value: m.oauth2_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'oauth2_failed_executions_total', value: m.oauth2_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'oauth2_avg_execution_time_ms', value: m.oauth2_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'oauth2_active_operations', value: m.oauth2_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP oauth2_executions_total Total executions',
      '# TYPE oauth2_executions_total counter',
      '# HELP oauth2_successful_executions_total Total successful executions',
      '# TYPE oauth2_successful_executions_total counter',
      '# HELP oauth2_failed_executions_total Total failed executions',
      '# TYPE oauth2_failed_executions_total counter',
      '# HELP oauth2_avg_execution_time_ms Average execution time in ms',
      '# TYPE oauth2_avg_execution_time_ms gauge',
      '# HELP oauth2_active_operations Current active operations',
      '# TYPE oauth2_active_operations gauge',
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
