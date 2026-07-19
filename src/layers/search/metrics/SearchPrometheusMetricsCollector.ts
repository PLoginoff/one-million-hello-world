import { SearchMetricsCollector } from '../statistics/SearchMetricsCollector';

export interface SearchPrometheusMetrics {
  search_executions_total: number;
  search_successful_executions_total: number;
  search_failed_executions_total: number;
  search_avg_execution_time_ms: number;
  search_active_operations: number;
  collectedAt: number;
}

export interface SearchMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SearchPrometheusMetricsCollector {
  private readonly _collector: SearchMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SearchMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SearchPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      search_executions_total: m.executionCount,
      search_successful_executions_total: m.successCount,
      search_failed_executions_total: m.failureCount,
      search_avg_execution_time_ms: m.averageExecutionTime,
      search_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SearchMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'search_executions_total', value: m.search_executions_total, labels: {}, timestamp: ts },
      {
        name: 'search_successful_executions_total',
        value: m.search_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'search_failed_executions_total', value: m.search_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'search_avg_execution_time_ms', value: m.search_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'search_active_operations', value: m.search_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP search_executions_total Total executions',
      '# TYPE search_executions_total counter',
      '# HELP search_successful_executions_total Total successful executions',
      '# TYPE search_successful_executions_total counter',
      '# HELP search_failed_executions_total Total failed executions',
      '# TYPE search_failed_executions_total counter',
      '# HELP search_avg_execution_time_ms Average execution time in ms',
      '# TYPE search_avg_execution_time_ms gauge',
      '# HELP search_active_operations Current active operations',
      '# TYPE search_active_operations gauge',
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
