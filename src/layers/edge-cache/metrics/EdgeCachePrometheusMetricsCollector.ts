import { EdgeCacheMetricsCollector } from '../statistics/EdgeCacheMetricsCollector';

export interface EdgeCachePrometheusMetrics {
  edge_cache_executions_total: number;
  edge_cache_successful_executions_total: number;
  edge_cache_failed_executions_total: number;
  edge_cache_avg_execution_time_ms: number;
  edge_cache_active_operations: number;
  collectedAt: number;
}

export interface EdgeCacheMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class EdgeCachePrometheusMetricsCollector {
  private readonly _collector: EdgeCacheMetricsCollector;
  private _collectionCount: number;

  constructor(collector: EdgeCacheMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): EdgeCachePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      edge_cache_executions_total: m.executionCount,
      edge_cache_successful_executions_total: m.successCount,
      edge_cache_failed_executions_total: m.failureCount,
      edge_cache_avg_execution_time_ms: m.averageExecutionTime,
      edge_cache_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): EdgeCacheMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'edge_cache_executions_total', value: m.edge_cache_executions_total, labels: {}, timestamp: ts },
      {
        name: 'edge_cache_successful_executions_total',
        value: m.edge_cache_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'edge_cache_failed_executions_total',
        value: m.edge_cache_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'edge_cache_avg_execution_time_ms',
        value: m.edge_cache_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'edge_cache_active_operations', value: m.edge_cache_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP edge_cache_executions_total Total executions',
      '# TYPE edge_cache_executions_total counter',
      '# HELP edge_cache_successful_executions_total Total successful executions',
      '# TYPE edge_cache_successful_executions_total counter',
      '# HELP edge_cache_failed_executions_total Total failed executions',
      '# TYPE edge_cache_failed_executions_total counter',
      '# HELP edge_cache_avg_execution_time_ms Average execution time in ms',
      '# TYPE edge_cache_avg_execution_time_ms gauge',
      '# HELP edge_cache_active_operations Current active operations',
      '# TYPE edge_cache_active_operations gauge',
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
