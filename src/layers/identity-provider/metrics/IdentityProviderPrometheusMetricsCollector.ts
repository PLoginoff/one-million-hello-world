import { IdentityProviderMetricsCollector } from '../statistics/IdentityProviderMetricsCollector';

export interface IdentityProviderPrometheusMetrics {
  identity_provider_executions_total: number;
  identity_provider_successful_executions_total: number;
  identity_provider_failed_executions_total: number;
  identity_provider_avg_execution_time_ms: number;
  identity_provider_active_operations: number;
  collectedAt: number;
}

export interface IdentityProviderMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class IdentityProviderPrometheusMetricsCollector {
  private readonly _collector: IdentityProviderMetricsCollector;
  private _collectionCount: number;

  constructor(collector: IdentityProviderMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): IdentityProviderPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      identity_provider_executions_total: m.executionCount,
      identity_provider_successful_executions_total: m.successCount,
      identity_provider_failed_executions_total: m.failureCount,
      identity_provider_avg_execution_time_ms: m.averageExecutionTime,
      identity_provider_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): IdentityProviderMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'identity_provider_executions_total',
        value: m.identity_provider_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'identity_provider_successful_executions_total',
        value: m.identity_provider_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'identity_provider_failed_executions_total',
        value: m.identity_provider_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'identity_provider_avg_execution_time_ms',
        value: m.identity_provider_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'identity_provider_active_operations',
        value: m.identity_provider_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP identity_provider_executions_total Total executions',
      '# TYPE identity_provider_executions_total counter',
      '# HELP identity_provider_successful_executions_total Total successful executions',
      '# TYPE identity_provider_successful_executions_total counter',
      '# HELP identity_provider_failed_executions_total Total failed executions',
      '# TYPE identity_provider_failed_executions_total counter',
      '# HELP identity_provider_avg_execution_time_ms Average execution time in ms',
      '# TYPE identity_provider_avg_execution_time_ms gauge',
      '# HELP identity_provider_active_operations Current active operations',
      '# TYPE identity_provider_active_operations gauge',
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
