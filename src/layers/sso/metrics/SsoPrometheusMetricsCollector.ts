import { SsoMetricsCollector } from '../statistics/SsoMetricsCollector';

export interface SsoPrometheusMetrics {
  sso_executions_total: number;
  sso_successful_executions_total: number;
  sso_failed_executions_total: number;
  sso_avg_execution_time_ms: number;
  sso_active_operations: number;
  collectedAt: number;
}

export interface SsoMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SsoPrometheusMetricsCollector {
  private readonly _collector: SsoMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SsoMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SsoPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      sso_executions_total: m.executionCount,
      sso_successful_executions_total: m.successCount,
      sso_failed_executions_total: m.failureCount,
      sso_avg_execution_time_ms: m.averageExecutionTime,
      sso_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SsoMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'sso_executions_total', value: m.sso_executions_total, labels: {}, timestamp: ts },
      { name: 'sso_successful_executions_total', value: m.sso_successful_executions_total, labels: {}, timestamp: ts },
      { name: 'sso_failed_executions_total', value: m.sso_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'sso_avg_execution_time_ms', value: m.sso_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'sso_active_operations', value: m.sso_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP sso_executions_total Total executions',
      '# TYPE sso_executions_total counter',
      '# HELP sso_successful_executions_total Total successful executions',
      '# TYPE sso_successful_executions_total counter',
      '# HELP sso_failed_executions_total Total failed executions',
      '# TYPE sso_failed_executions_total counter',
      '# HELP sso_avg_execution_time_ms Average execution time in ms',
      '# TYPE sso_avg_execution_time_ms gauge',
      '# HELP sso_active_operations Current active operations',
      '# TYPE sso_active_operations gauge',
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
