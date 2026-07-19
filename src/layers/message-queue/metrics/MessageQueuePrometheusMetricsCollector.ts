import { MessageQueueMetricsCollector } from '../statistics/MessageQueueMetricsCollector';

export interface MessageQueuePrometheusMetrics {
  message_queue_executions_total: number;
  message_queue_successful_executions_total: number;
  message_queue_failed_executions_total: number;
  message_queue_avg_execution_time_ms: number;
  message_queue_active_operations: number;
  collectedAt: number;
}

export interface MessageQueueMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MessageQueuePrometheusMetricsCollector {
  private readonly _collector: MessageQueueMetricsCollector;
  private _collectionCount: number;

  constructor(collector: MessageQueueMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): MessageQueuePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      message_queue_executions_total: m.executionCount,
      message_queue_successful_executions_total: m.successCount,
      message_queue_failed_executions_total: m.failureCount,
      message_queue_avg_execution_time_ms: m.averageExecutionTime,
      message_queue_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): MessageQueueMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'message_queue_executions_total', value: m.message_queue_executions_total, labels: {}, timestamp: ts },
      {
        name: 'message_queue_successful_executions_total',
        value: m.message_queue_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'message_queue_failed_executions_total',
        value: m.message_queue_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'message_queue_avg_execution_time_ms',
        value: m.message_queue_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'message_queue_active_operations', value: m.message_queue_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP message_queue_executions_total Total executions',
      '# TYPE message_queue_executions_total counter',
      '# HELP message_queue_successful_executions_total Total successful executions',
      '# TYPE message_queue_successful_executions_total counter',
      '# HELP message_queue_failed_executions_total Total failed executions',
      '# TYPE message_queue_failed_executions_total counter',
      '# HELP message_queue_avg_execution_time_ms Average execution time in ms',
      '# TYPE message_queue_avg_execution_time_ms gauge',
      '# HELP message_queue_active_operations Current active operations',
      '# TYPE message_queue_active_operations gauge',
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
