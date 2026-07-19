import { MfaMetricsCollector } from '../statistics/MfaMetricsCollector';

export interface MfaPrometheusMetrics {
  mfa_executions_total: number;
  mfa_successful_executions_total: number;
  mfa_failed_executions_total: number;
  mfa_avg_execution_time_ms: number;
  mfa_active_operations: number;
  collectedAt: number;
}

export interface MfaMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MfaPrometheusMetricsCollector {
  private readonly _collector: MfaMetricsCollector;
  private _collectionCount: number;

  constructor(collector: MfaMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): MfaPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      mfa_executions_total: m.executionCount,
      mfa_successful_executions_total: m.successCount,
      mfa_failed_executions_total: m.failureCount,
      mfa_avg_execution_time_ms: m.averageExecutionTime,
      mfa_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): MfaMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'mfa_executions_total', value: m.mfa_executions_total, labels: {}, timestamp: ts },
      { name: 'mfa_successful_executions_total', value: m.mfa_successful_executions_total, labels: {}, timestamp: ts },
      { name: 'mfa_failed_executions_total', value: m.mfa_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'mfa_avg_execution_time_ms', value: m.mfa_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'mfa_active_operations', value: m.mfa_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP mfa_executions_total Total executions',
      '# TYPE mfa_executions_total counter',
      '# HELP mfa_successful_executions_total Total successful executions',
      '# TYPE mfa_successful_executions_total counter',
      '# HELP mfa_failed_executions_total Total failed executions',
      '# TYPE mfa_failed_executions_total counter',
      '# HELP mfa_avg_execution_time_ms Average execution time in ms',
      '# TYPE mfa_avg_execution_time_ms gauge',
      '# HELP mfa_active_operations Current active operations',
      '# TYPE mfa_active_operations gauge',
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
