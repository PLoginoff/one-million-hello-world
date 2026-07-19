import { IdentityMetricsCollector } from '../statistics/IdentityMetricsCollector';

export interface IdentityPrometheusMetrics {
  identity_executions_total: number;
  identity_successful_executions_total: number;
  identity_failed_executions_total: number;
  identity_avg_execution_time_ms: number;
  identity_active_operations: number;
  collectedAt: number;
}

export interface IdentityMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class IdentityPrometheusMetricsCollector {
  private readonly _collector: IdentityMetricsCollector;
  private _collectionCount: number;

  constructor(collector: IdentityMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): IdentityPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      identity_executions_total: m.executionCount,
      identity_successful_executions_total: m.successCount,
      identity_failed_executions_total: m.failureCount,
      identity_avg_execution_time_ms: m.averageExecutionTime,
      identity_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): IdentityMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'identity_executions_total', value: m.identity_executions_total, labels: {}, timestamp: ts },
      {
        name: 'identity_successful_executions_total',
        value: m.identity_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'identity_failed_executions_total',
        value: m.identity_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'identity_avg_execution_time_ms', value: m.identity_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'identity_active_operations', value: m.identity_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP identity_executions_total Total executions',
      '# TYPE identity_executions_total counter',
      '# HELP identity_successful_executions_total Total successful executions',
      '# TYPE identity_successful_executions_total counter',
      '# HELP identity_failed_executions_total Total failed executions',
      '# TYPE identity_failed_executions_total counter',
      '# HELP identity_avg_execution_time_ms Average execution time in ms',
      '# TYPE identity_avg_execution_time_ms gauge',
      '# HELP identity_active_operations Current active operations',
      '# TYPE identity_active_operations gauge',
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
