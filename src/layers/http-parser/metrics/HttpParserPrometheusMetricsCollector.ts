import { HttpParserMetricsCollector } from '../statistics/HttpParserMetricsCollector';

export interface HttpParserPrometheusMetrics {
  http_parser_executions_total: number;
  http_parser_successful_executions_total: number;
  http_parser_failed_executions_total: number;
  http_parser_avg_execution_time_ms: number;
  http_parser_active_operations: number;
  collectedAt: number;
}

export interface HttpParserMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class HttpParserPrometheusMetricsCollector {
  private readonly _collector: HttpParserMetricsCollector;
  private _collectionCount: number;

  constructor(collector: HttpParserMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): HttpParserPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      http_parser_executions_total: m.executionCount,
      http_parser_successful_executions_total: m.successCount,
      http_parser_failed_executions_total: m.failureCount,
      http_parser_avg_execution_time_ms: m.averageExecutionTime,
      http_parser_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): HttpParserMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'http_parser_executions_total', value: m.http_parser_executions_total, labels: {}, timestamp: ts },
      {
        name: 'http_parser_successful_executions_total',
        value: m.http_parser_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'http_parser_failed_executions_total',
        value: m.http_parser_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'http_parser_avg_execution_time_ms',
        value: m.http_parser_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'http_parser_active_operations', value: m.http_parser_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP http_parser_executions_total Total executions',
      '# TYPE http_parser_executions_total counter',
      '# HELP http_parser_successful_executions_total Total successful executions',
      '# TYPE http_parser_successful_executions_total counter',
      '# HELP http_parser_failed_executions_total Total failed executions',
      '# TYPE http_parser_failed_executions_total counter',
      '# HELP http_parser_avg_execution_time_ms Average execution time in ms',
      '# TYPE http_parser_avg_execution_time_ms gauge',
      '# HELP http_parser_active_operations Current active operations',
      '# TYPE http_parser_active_operations gauge',
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
