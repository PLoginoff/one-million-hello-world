import { MessageBusMetricsCollector } from '../statistics/MessageBusMetricsCollector';

export interface MessageBusPrometheusMetrics {
  message_bus_executions_total: number;
  message_bus_successful_executions_total: number;
  message_bus_failed_executions_total: number;
  message_bus_avg_execution_time_ms: number;
  message_bus_active_operations: number;
  collectedAt: number;
}

export interface MessageBusMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MessageBusPrometheusMetricsCollector {
  private readonly _collector: MessageBusMetricsCollector;
  private _collectionCount: number;

  constructor(collector: MessageBusMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): MessageBusPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      message_bus_executions_total: m.executionCount,
      message_bus_successful_executions_total: m.successCount,
      message_bus_failed_executions_total: m.failureCount,
      message_bus_avg_execution_time_ms: m.averageExecutionTime,
      message_bus_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): MessageBusMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'message_bus_executions_total', value: m.message_bus_executions_total, labels: {}, timestamp: ts },
      {
        name: 'message_bus_successful_executions_total',
        value: m.message_bus_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'message_bus_failed_executions_total',
        value: m.message_bus_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'message_bus_avg_execution_time_ms',
        value: m.message_bus_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'message_bus_active_operations', value: m.message_bus_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP message_bus_executions_total Total executions',
      '# TYPE message_bus_executions_total counter',
      '# HELP message_bus_successful_executions_total Total successful executions',
      '# TYPE message_bus_successful_executions_total counter',
      '# HELP message_bus_failed_executions_total Total failed executions',
      '# TYPE message_bus_failed_executions_total counter',
      '# HELP message_bus_avg_execution_time_ms Average execution time in ms',
      '# TYPE message_bus_avg_execution_time_ms gauge',
      '# HELP message_bus_active_operations Current active operations',
      '# TYPE message_bus_active_operations gauge',
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
