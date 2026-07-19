import { QueryObjectMetricsCollector } from '../statistics/QueryObjectMetricsCollector';

export interface QueryObjectPrometheusMetrics {
  query_object_executions_total: number;
  query_object_successful_executions_total: number;
  query_object_failed_executions_total: number;
  query_object_avg_execution_time_ms: number;
  query_object_active_operations: number;
  collectedAt: number;
}

export interface QueryObjectMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class QueryObjectPrometheusMetricsCollector {
  private readonly _collector: QueryObjectMetricsCollector;
  private _collectionCount: number;

  constructor(collector: QueryObjectMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): QueryObjectPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      query_object_executions_total: m.executionCount,
      query_object_successful_executions_total: m.successCount,
      query_object_failed_executions_total: m.failureCount,
      query_object_avg_execution_time_ms: m.averageExecutionTime,
      query_object_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): QueryObjectMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'query_object_executions_total', value: m.query_object_executions_total, labels: {}, timestamp: ts },
      {
        name: 'query_object_successful_executions_total',
        value: m.query_object_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'query_object_failed_executions_total',
        value: m.query_object_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'query_object_avg_execution_time_ms',
        value: m.query_object_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'query_object_active_operations', value: m.query_object_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP query_object_executions_total Total executions',
      '# TYPE query_object_executions_total counter',
      '# HELP query_object_successful_executions_total Total successful executions',
      '# TYPE query_object_successful_executions_total counter',
      '# HELP query_object_failed_executions_total Total failed executions',
      '# TYPE query_object_failed_executions_total counter',
      '# HELP query_object_avg_execution_time_ms Average execution time in ms',
      '# TYPE query_object_avg_execution_time_ms gauge',
      '# HELP query_object_active_operations Current active operations',
      '# TYPE query_object_active_operations gauge',
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
