import { EventMetricsCollector } from '../statistics/EventMetricsCollector';

export interface EventPrometheusMetrics {
  event_executions_total: number;
  event_successful_executions_total: number;
  event_failed_executions_total: number;
  event_avg_execution_time_ms: number;
  event_active_operations: number;
  collectedAt: number;
}

export interface EventMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class EventPrometheusMetricsCollector {
  private readonly _collector: EventMetricsCollector;
  private _collectionCount: number;

  constructor(collector: EventMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): EventPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      event_executions_total: m.executionCount,
      event_successful_executions_total: m.successCount,
      event_failed_executions_total: m.failureCount,
      event_avg_execution_time_ms: m.averageExecutionTime,
      event_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): EventMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'event_executions_total', value: m.event_executions_total, labels: {}, timestamp: ts },
      {
        name: 'event_successful_executions_total',
        value: m.event_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'event_failed_executions_total', value: m.event_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'event_avg_execution_time_ms', value: m.event_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'event_active_operations', value: m.event_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP event_executions_total Total executions',
      '# TYPE event_executions_total counter',
      '# HELP event_successful_executions_total Total successful executions',
      '# TYPE event_successful_executions_total counter',
      '# HELP event_failed_executions_total Total failed executions',
      '# TYPE event_failed_executions_total counter',
      '# HELP event_avg_execution_time_ms Average execution time in ms',
      '# TYPE event_avg_execution_time_ms gauge',
      '# HELP event_active_operations Current active operations',
      '# TYPE event_active_operations gauge',
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
