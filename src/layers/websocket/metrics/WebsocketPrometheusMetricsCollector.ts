import { WebsocketMetricsCollector } from '../statistics/WebsocketMetricsCollector';

export interface WebsocketPrometheusMetrics {
  websocket_executions_total: number;
  websocket_successful_executions_total: number;
  websocket_failed_executions_total: number;
  websocket_avg_execution_time_ms: number;
  websocket_active_operations: number;
  collectedAt: number;
}

export interface WebsocketMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class WebsocketPrometheusMetricsCollector {
  private readonly _collector: WebsocketMetricsCollector;
  private _collectionCount: number;

  constructor(collector: WebsocketMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): WebsocketPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      websocket_executions_total: m.executionCount,
      websocket_successful_executions_total: m.successCount,
      websocket_failed_executions_total: m.failureCount,
      websocket_avg_execution_time_ms: m.averageExecutionTime,
      websocket_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): WebsocketMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'websocket_executions_total', value: m.websocket_executions_total, labels: {}, timestamp: ts },
      {
        name: 'websocket_successful_executions_total',
        value: m.websocket_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'websocket_failed_executions_total',
        value: m.websocket_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'websocket_avg_execution_time_ms', value: m.websocket_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'websocket_active_operations', value: m.websocket_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP websocket_executions_total Total executions',
      '# TYPE websocket_executions_total counter',
      '# HELP websocket_successful_executions_total Total successful executions',
      '# TYPE websocket_successful_executions_total counter',
      '# HELP websocket_failed_executions_total Total failed executions',
      '# TYPE websocket_failed_executions_total counter',
      '# HELP websocket_avg_execution_time_ms Average execution time in ms',
      '# TYPE websocket_avg_execution_time_ms gauge',
      '# HELP websocket_active_operations Current active operations',
      '# TYPE websocket_active_operations gauge',
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
