import { InboxMetricsCollector } from '../statistics/InboxMetricsCollector';

export interface InboxPrometheusMetrics {
  inbox_executions_total: number;
  inbox_successful_executions_total: number;
  inbox_failed_executions_total: number;
  inbox_avg_execution_time_ms: number;
  inbox_active_operations: number;
  collectedAt: number;
}

export interface InboxMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class InboxPrometheusMetricsCollector {
  private readonly _collector: InboxMetricsCollector;
  private _collectionCount: number;

  constructor(collector: InboxMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): InboxPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      inbox_executions_total: m.executionCount,
      inbox_successful_executions_total: m.successCount,
      inbox_failed_executions_total: m.failureCount,
      inbox_avg_execution_time_ms: m.averageExecutionTime,
      inbox_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): InboxMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'inbox_executions_total', value: m.inbox_executions_total, labels: {}, timestamp: ts },
      {
        name: 'inbox_successful_executions_total',
        value: m.inbox_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'inbox_failed_executions_total', value: m.inbox_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'inbox_avg_execution_time_ms', value: m.inbox_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'inbox_active_operations', value: m.inbox_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP inbox_executions_total Total executions',
      '# TYPE inbox_executions_total counter',
      '# HELP inbox_successful_executions_total Total successful executions',
      '# TYPE inbox_successful_executions_total counter',
      '# HELP inbox_failed_executions_total Total failed executions',
      '# TYPE inbox_failed_executions_total counter',
      '# HELP inbox_avg_execution_time_ms Average execution time in ms',
      '# TYPE inbox_avg_execution_time_ms gauge',
      '# HELP inbox_active_operations Current active operations',
      '# TYPE inbox_active_operations gauge',
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
