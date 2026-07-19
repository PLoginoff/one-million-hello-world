import { BillingMetricsCollector } from '../statistics/BillingMetricsCollector';

export interface BillingPrometheusMetrics {
  billing_executions_total: number;
  billing_successful_executions_total: number;
  billing_failed_executions_total: number;
  billing_avg_execution_time_ms: number;
  billing_active_operations: number;
  collectedAt: number;
}

export interface BillingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class BillingPrometheusMetricsCollector {
  private readonly _collector: BillingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: BillingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): BillingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      billing_executions_total: m.executionCount,
      billing_successful_executions_total: m.successCount,
      billing_failed_executions_total: m.failureCount,
      billing_avg_execution_time_ms: m.averageExecutionTime,
      billing_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): BillingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'billing_executions_total', value: m.billing_executions_total, labels: {}, timestamp: ts },
      {
        name: 'billing_successful_executions_total',
        value: m.billing_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'billing_failed_executions_total', value: m.billing_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'billing_avg_execution_time_ms', value: m.billing_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'billing_active_operations', value: m.billing_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP billing_executions_total Total executions',
      '# TYPE billing_executions_total counter',
      '# HELP billing_successful_executions_total Total successful executions',
      '# TYPE billing_successful_executions_total counter',
      '# HELP billing_failed_executions_total Total failed executions',
      '# TYPE billing_failed_executions_total counter',
      '# HELP billing_avg_execution_time_ms Average execution time in ms',
      '# TYPE billing_avg_execution_time_ms gauge',
      '# HELP billing_active_operations Current active operations',
      '# TYPE billing_active_operations gauge',
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
