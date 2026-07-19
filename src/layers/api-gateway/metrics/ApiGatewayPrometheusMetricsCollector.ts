import { ApiGatewayMetricsCollector } from '../statistics/ApiGatewayMetricsCollector';

export interface ApiGatewayPrometheusMetrics {
  api_gateway_executions_total: number;
  api_gateway_successful_executions_total: number;
  api_gateway_failed_executions_total: number;
  api_gateway_avg_execution_time_ms: number;
  api_gateway_active_operations: number;
  collectedAt: number;
}

export interface ApiGatewayMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ApiGatewayPrometheusMetricsCollector {
  private readonly _collector: ApiGatewayMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ApiGatewayMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ApiGatewayPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      api_gateway_executions_total: m.executionCount,
      api_gateway_successful_executions_total: m.successCount,
      api_gateway_failed_executions_total: m.failureCount,
      api_gateway_avg_execution_time_ms: m.averageExecutionTime,
      api_gateway_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ApiGatewayMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'api_gateway_executions_total', value: m.api_gateway_executions_total, labels: {}, timestamp: ts },
      {
        name: 'api_gateway_successful_executions_total',
        value: m.api_gateway_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'api_gateway_failed_executions_total',
        value: m.api_gateway_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'api_gateway_avg_execution_time_ms',
        value: m.api_gateway_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'api_gateway_active_operations', value: m.api_gateway_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP api_gateway_executions_total Total executions',
      '# TYPE api_gateway_executions_total counter',
      '# HELP api_gateway_successful_executions_total Total successful executions',
      '# TYPE api_gateway_successful_executions_total counter',
      '# HELP api_gateway_failed_executions_total Total failed executions',
      '# TYPE api_gateway_failed_executions_total counter',
      '# HELP api_gateway_avg_execution_time_ms Average execution time in ms',
      '# TYPE api_gateway_avg_execution_time_ms gauge',
      '# HELP api_gateway_active_operations Current active operations',
      '# TYPE api_gateway_active_operations gauge',
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
