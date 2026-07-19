import { DisasterRecoveryMetricsCollector } from '../statistics/DisasterRecoveryMetricsCollector';

export interface DisasterRecoveryPrometheusMetrics {
  disaster_recovery_executions_total: number;
  disaster_recovery_successful_executions_total: number;
  disaster_recovery_failed_executions_total: number;
  disaster_recovery_avg_execution_time_ms: number;
  disaster_recovery_active_operations: number;
  collectedAt: number;
}

export interface DisasterRecoveryMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class DisasterRecoveryPrometheusMetricsCollector {
  private readonly _collector: DisasterRecoveryMetricsCollector;
  private _collectionCount: number;

  constructor(collector: DisasterRecoveryMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): DisasterRecoveryPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      disaster_recovery_executions_total: m.executionCount,
      disaster_recovery_successful_executions_total: m.successCount,
      disaster_recovery_failed_executions_total: m.failureCount,
      disaster_recovery_avg_execution_time_ms: m.averageExecutionTime,
      disaster_recovery_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): DisasterRecoveryMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'disaster_recovery_executions_total',
        value: m.disaster_recovery_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'disaster_recovery_successful_executions_total',
        value: m.disaster_recovery_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'disaster_recovery_failed_executions_total',
        value: m.disaster_recovery_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'disaster_recovery_avg_execution_time_ms',
        value: m.disaster_recovery_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'disaster_recovery_active_operations',
        value: m.disaster_recovery_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP disaster_recovery_executions_total Total executions',
      '# TYPE disaster_recovery_executions_total counter',
      '# HELP disaster_recovery_successful_executions_total Total successful executions',
      '# TYPE disaster_recovery_successful_executions_total counter',
      '# HELP disaster_recovery_failed_executions_total Total failed executions',
      '# TYPE disaster_recovery_failed_executions_total counter',
      '# HELP disaster_recovery_avg_execution_time_ms Average execution time in ms',
      '# TYPE disaster_recovery_avg_execution_time_ms gauge',
      '# HELP disaster_recovery_active_operations Current active operations',
      '# TYPE disaster_recovery_active_operations gauge',
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
