import { AuditMetricsCollector } from '../statistics/AuditMetricsCollector';

export interface AuditPrometheusMetrics {
  audit_executions_total: number;
  audit_successful_executions_total: number;
  audit_failed_executions_total: number;
  audit_avg_execution_time_ms: number;
  audit_active_operations: number;
  collectedAt: number;
}

export interface AuditMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class AuditPrometheusMetricsCollector {
  private readonly _collector: AuditMetricsCollector;
  private _collectionCount: number;

  constructor(collector: AuditMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): AuditPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      audit_executions_total: m.executionCount,
      audit_successful_executions_total: m.successCount,
      audit_failed_executions_total: m.failureCount,
      audit_avg_execution_time_ms: m.averageExecutionTime,
      audit_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): AuditMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'audit_executions_total', value: m.audit_executions_total, labels: {}, timestamp: ts },
      {
        name: 'audit_successful_executions_total',
        value: m.audit_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'audit_failed_executions_total', value: m.audit_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'audit_avg_execution_time_ms', value: m.audit_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'audit_active_operations', value: m.audit_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP audit_executions_total Total executions',
      '# TYPE audit_executions_total counter',
      '# HELP audit_successful_executions_total Total successful executions',
      '# TYPE audit_successful_executions_total counter',
      '# HELP audit_failed_executions_total Total failed executions',
      '# TYPE audit_failed_executions_total counter',
      '# HELP audit_avg_execution_time_ms Average execution time in ms',
      '# TYPE audit_avg_execution_time_ms gauge',
      '# HELP audit_active_operations Current active operations',
      '# TYPE audit_active_operations gauge',
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
