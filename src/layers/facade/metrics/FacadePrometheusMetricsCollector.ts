import { FacadeMetricsCollector } from '../statistics/FacadeMetricsCollector';

export interface FacadePrometheusMetrics {
  facade_executions_total: number;
  facade_successful_executions_total: number;
  facade_failed_executions_total: number;
  facade_avg_execution_time_ms: number;
  facade_active_operations: number;
  collectedAt: number;
}

export interface FacadeMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class FacadePrometheusMetricsCollector {
  private readonly _collector: FacadeMetricsCollector;
  private _collectionCount: number;

  constructor(collector: FacadeMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): FacadePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      facade_executions_total: m.executionCount,
      facade_successful_executions_total: m.successCount,
      facade_failed_executions_total: m.failureCount,
      facade_avg_execution_time_ms: m.averageExecutionTime,
      facade_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): FacadeMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'facade_executions_total', value: m.facade_executions_total, labels: {}, timestamp: ts },
      {
        name: 'facade_successful_executions_total',
        value: m.facade_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'facade_failed_executions_total', value: m.facade_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'facade_avg_execution_time_ms', value: m.facade_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'facade_active_operations', value: m.facade_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP facade_executions_total Total executions',
      '# TYPE facade_executions_total counter',
      '# HELP facade_successful_executions_total Total successful executions',
      '# TYPE facade_successful_executions_total counter',
      '# HELP facade_failed_executions_total Total failed executions',
      '# TYPE facade_failed_executions_total counter',
      '# HELP facade_avg_execution_time_ms Average execution time in ms',
      '# TYPE facade_avg_execution_time_ms gauge',
      '# HELP facade_active_operations Current active operations',
      '# TYPE facade_active_operations gauge',
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
