import { GraphqlMetricsCollector } from '../statistics/GraphqlMetricsCollector';

export interface GraphqlPrometheusMetrics {
  graphql_executions_total: number;
  graphql_successful_executions_total: number;
  graphql_failed_executions_total: number;
  graphql_avg_execution_time_ms: number;
  graphql_active_operations: number;
  collectedAt: number;
}

export interface GraphqlMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class GraphqlPrometheusMetricsCollector {
  private readonly _collector: GraphqlMetricsCollector;
  private _collectionCount: number;

  constructor(collector: GraphqlMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): GraphqlPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      graphql_executions_total: m.executionCount,
      graphql_successful_executions_total: m.successCount,
      graphql_failed_executions_total: m.failureCount,
      graphql_avg_execution_time_ms: m.averageExecutionTime,
      graphql_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): GraphqlMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'graphql_executions_total', value: m.graphql_executions_total, labels: {}, timestamp: ts },
      {
        name: 'graphql_successful_executions_total',
        value: m.graphql_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'graphql_failed_executions_total', value: m.graphql_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'graphql_avg_execution_time_ms', value: m.graphql_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'graphql_active_operations', value: m.graphql_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP graphql_executions_total Total executions',
      '# TYPE graphql_executions_total counter',
      '# HELP graphql_successful_executions_total Total successful executions',
      '# TYPE graphql_successful_executions_total counter',
      '# HELP graphql_failed_executions_total Total failed executions',
      '# TYPE graphql_failed_executions_total counter',
      '# HELP graphql_avg_execution_time_ms Average execution time in ms',
      '# TYPE graphql_avg_execution_time_ms gauge',
      '# HELP graphql_active_operations Current active operations',
      '# TYPE graphql_active_operations gauge',
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
