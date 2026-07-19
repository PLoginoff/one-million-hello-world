import { EventSourcingMetricsCollector } from '../statistics/EventSourcingMetricsCollector';

export interface EventSourcingPrometheusMetrics {
  event_sourcing_executions_total: number;
  event_sourcing_successful_executions_total: number;
  event_sourcing_failed_executions_total: number;
  event_sourcing_avg_execution_time_ms: number;
  event_sourcing_active_operations: number;
  collectedAt: number;
}

export interface EventSourcingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class EventSourcingPrometheusMetricsCollector {
  private readonly _collector: EventSourcingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: EventSourcingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): EventSourcingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      event_sourcing_executions_total: m.executionCount,
      event_sourcing_successful_executions_total: m.successCount,
      event_sourcing_failed_executions_total: m.failureCount,
      event_sourcing_avg_execution_time_ms: m.averageExecutionTime,
      event_sourcing_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): EventSourcingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'event_sourcing_executions_total', value: m.event_sourcing_executions_total, labels: {}, timestamp: ts },
      {
        name: 'event_sourcing_successful_executions_total',
        value: m.event_sourcing_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'event_sourcing_failed_executions_total',
        value: m.event_sourcing_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'event_sourcing_avg_execution_time_ms',
        value: m.event_sourcing_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'event_sourcing_active_operations',
        value: m.event_sourcing_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP event_sourcing_executions_total Total executions',
      '# TYPE event_sourcing_executions_total counter',
      '# HELP event_sourcing_successful_executions_total Total successful executions',
      '# TYPE event_sourcing_successful_executions_total counter',
      '# HELP event_sourcing_failed_executions_total Total failed executions',
      '# TYPE event_sourcing_failed_executions_total counter',
      '# HELP event_sourcing_avg_execution_time_ms Average execution time in ms',
      '# TYPE event_sourcing_avg_execution_time_ms gauge',
      '# HELP event_sourcing_active_operations Current active operations',
      '# TYPE event_sourcing_active_operations gauge',
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
