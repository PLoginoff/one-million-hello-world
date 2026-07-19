import { BackupMetricsCollector } from '../statistics/BackupMetricsCollector';

export interface BackupPrometheusMetrics {
  backup_executions_total: number;
  backup_successful_executions_total: number;
  backup_failed_executions_total: number;
  backup_avg_execution_time_ms: number;
  backup_active_operations: number;
  collectedAt: number;
}

export interface BackupMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class BackupPrometheusMetricsCollector {
  private readonly _collector: BackupMetricsCollector;
  private _collectionCount: number;

  constructor(collector: BackupMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): BackupPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      backup_executions_total: m.executionCount,
      backup_successful_executions_total: m.successCount,
      backup_failed_executions_total: m.failureCount,
      backup_avg_execution_time_ms: m.averageExecutionTime,
      backup_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): BackupMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'backup_executions_total', value: m.backup_executions_total, labels: {}, timestamp: ts },
      {
        name: 'backup_successful_executions_total',
        value: m.backup_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'backup_failed_executions_total', value: m.backup_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'backup_avg_execution_time_ms', value: m.backup_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'backup_active_operations', value: m.backup_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP backup_executions_total Total executions',
      '# TYPE backup_executions_total counter',
      '# HELP backup_successful_executions_total Total successful executions',
      '# TYPE backup_successful_executions_total counter',
      '# HELP backup_failed_executions_total Total failed executions',
      '# TYPE backup_failed_executions_total counter',
      '# HELP backup_avg_execution_time_ms Average execution time in ms',
      '# TYPE backup_avg_execution_time_ms gauge',
      '# HELP backup_active_operations Current active operations',
      '# TYPE backup_active_operations gauge',
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
