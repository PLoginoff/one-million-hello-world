import { OutboxMetricsCollector } from '../statistics/OutboxMetricsCollector';

export interface OutboxPrometheusMetrics {
  outbox_executions_total: number;
  outbox_successful_executions_total: number;
  outbox_failed_executions_total: number;
  outbox_avg_execution_time_ms: number;
  outbox_active_operations: number;
  collectedAt: number;
}

export interface OutboxMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class OutboxPrometheusMetricsCollector {
  private readonly _collector: OutboxMetricsCollector;
  private _collectionCount: number;

  constructor(collector: OutboxMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): OutboxPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      outbox_executions_total: m.executionCount,
      outbox_successful_executions_total: m.successCount,
      outbox_failed_executions_total: m.failureCount,
      outbox_avg_execution_time_ms: m.averageExecutionTime,
      outbox_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): OutboxMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'outbox_executions_total', value: m.outbox_executions_total, labels: {}, timestamp: ts },
      {
        name: 'outbox_successful_executions_total',
        value: m.outbox_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'outbox_failed_executions_total', value: m.outbox_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'outbox_avg_execution_time_ms', value: m.outbox_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'outbox_active_operations', value: m.outbox_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP outbox_executions_total Total executions',
      '# TYPE outbox_executions_total counter',
      '# HELP outbox_successful_executions_total Total successful executions',
      '# TYPE outbox_successful_executions_total counter',
      '# HELP outbox_failed_executions_total Total failed executions',
      '# TYPE outbox_failed_executions_total counter',
      '# HELP outbox_avg_execution_time_ms Average execution time in ms',
      '# TYPE outbox_avg_execution_time_ms gauge',
      '# HELP outbox_active_operations Current active operations',
      '# TYPE outbox_active_operations gauge',
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
