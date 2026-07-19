import { ProxyMetricsCollector } from '../statistics/ProxyMetricsCollector';

export interface ProxyPrometheusMetrics {
  proxy_executions_total: number;
  proxy_successful_executions_total: number;
  proxy_failed_executions_total: number;
  proxy_avg_execution_time_ms: number;
  proxy_active_operations: number;
  collectedAt: number;
}

export interface ProxyMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ProxyPrometheusMetricsCollector {
  private readonly _collector: ProxyMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ProxyMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ProxyPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      proxy_executions_total: m.executionCount,
      proxy_successful_executions_total: m.successCount,
      proxy_failed_executions_total: m.failureCount,
      proxy_avg_execution_time_ms: m.averageExecutionTime,
      proxy_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ProxyMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'proxy_executions_total', value: m.proxy_executions_total, labels: {}, timestamp: ts },
      {
        name: 'proxy_successful_executions_total',
        value: m.proxy_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'proxy_failed_executions_total', value: m.proxy_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'proxy_avg_execution_time_ms', value: m.proxy_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'proxy_active_operations', value: m.proxy_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP proxy_executions_total Total executions',
      '# TYPE proxy_executions_total counter',
      '# HELP proxy_successful_executions_total Total successful executions',
      '# TYPE proxy_successful_executions_total counter',
      '# HELP proxy_failed_executions_total Total failed executions',
      '# TYPE proxy_failed_executions_total counter',
      '# HELP proxy_avg_execution_time_ms Average execution time in ms',
      '# TYPE proxy_avg_execution_time_ms gauge',
      '# HELP proxy_active_operations Current active operations',
      '# TYPE proxy_active_operations gauge',
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
