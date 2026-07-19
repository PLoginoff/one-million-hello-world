import { SnapshotMetricsCollector } from '../statistics/SnapshotMetricsCollector';

export interface SnapshotPrometheusMetrics {
  snapshot_executions_total: number;
  snapshot_successful_executions_total: number;
  snapshot_failed_executions_total: number;
  snapshot_avg_execution_time_ms: number;
  snapshot_active_operations: number;
  collectedAt: number;
}

export interface SnapshotMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SnapshotPrometheusMetricsCollector {
  private readonly _collector: SnapshotMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SnapshotMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SnapshotPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      snapshot_executions_total: m.executionCount,
      snapshot_successful_executions_total: m.successCount,
      snapshot_failed_executions_total: m.failureCount,
      snapshot_avg_execution_time_ms: m.averageExecutionTime,
      snapshot_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SnapshotMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'snapshot_executions_total', value: m.snapshot_executions_total, labels: {}, timestamp: ts },
      {
        name: 'snapshot_successful_executions_total',
        value: m.snapshot_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'snapshot_failed_executions_total',
        value: m.snapshot_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'snapshot_avg_execution_time_ms', value: m.snapshot_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'snapshot_active_operations', value: m.snapshot_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP snapshot_executions_total Total executions',
      '# TYPE snapshot_executions_total counter',
      '# HELP snapshot_successful_executions_total Total successful executions',
      '# TYPE snapshot_successful_executions_total counter',
      '# HELP snapshot_failed_executions_total Total failed executions',
      '# TYPE snapshot_failed_executions_total counter',
      '# HELP snapshot_avg_execution_time_ms Average execution time in ms',
      '# TYPE snapshot_avg_execution_time_ms gauge',
      '# HELP snapshot_active_operations Current active operations',
      '# TYPE snapshot_active_operations gauge',
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
