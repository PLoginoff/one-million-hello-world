import { NotificationMetricsCollector } from '../statistics/NotificationMetricsCollector';

export interface NotificationPrometheusMetrics {
  notification_executions_total: number;
  notification_successful_executions_total: number;
  notification_failed_executions_total: number;
  notification_avg_execution_time_ms: number;
  notification_active_operations: number;
  collectedAt: number;
}

export interface NotificationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class NotificationPrometheusMetricsCollector {
  private readonly _collector: NotificationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: NotificationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): NotificationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      notification_executions_total: m.executionCount,
      notification_successful_executions_total: m.successCount,
      notification_failed_executions_total: m.failureCount,
      notification_avg_execution_time_ms: m.averageExecutionTime,
      notification_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): NotificationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'notification_executions_total', value: m.notification_executions_total, labels: {}, timestamp: ts },
      {
        name: 'notification_successful_executions_total',
        value: m.notification_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'notification_failed_executions_total',
        value: m.notification_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'notification_avg_execution_time_ms',
        value: m.notification_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'notification_active_operations', value: m.notification_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP notification_executions_total Total executions',
      '# TYPE notification_executions_total counter',
      '# HELP notification_successful_executions_total Total successful executions',
      '# TYPE notification_successful_executions_total counter',
      '# HELP notification_failed_executions_total Total failed executions',
      '# TYPE notification_failed_executions_total counter',
      '# HELP notification_avg_execution_time_ms Average execution time in ms',
      '# TYPE notification_avg_execution_time_ms gauge',
      '# HELP notification_active_operations Current active operations',
      '# TYPE notification_active_operations gauge',
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
