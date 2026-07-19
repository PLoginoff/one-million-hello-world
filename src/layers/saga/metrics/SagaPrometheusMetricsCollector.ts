import { SagaMetricsCollector } from '../statistics/SagaMetricsCollector';

export interface SagaPrometheusMetrics {
  saga_executions_total: number;
  saga_successful_executions_total: number;
  saga_failed_executions_total: number;
  saga_avg_execution_time_ms: number;
  saga_active_operations: number;
  collectedAt: number;
}

export interface SagaMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SagaPrometheusMetricsCollector {
  private readonly _collector: SagaMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SagaMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SagaPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      saga_executions_total: m.executionCount,
      saga_successful_executions_total: m.successCount,
      saga_failed_executions_total: m.failureCount,
      saga_avg_execution_time_ms: m.averageExecutionTime,
      saga_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SagaMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'saga_executions_total', value: m.saga_executions_total, labels: {}, timestamp: ts },
      {
        name: 'saga_successful_executions_total',
        value: m.saga_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'saga_failed_executions_total', value: m.saga_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'saga_avg_execution_time_ms', value: m.saga_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'saga_active_operations', value: m.saga_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP saga_executions_total Total executions',
      '# TYPE saga_executions_total counter',
      '# HELP saga_successful_executions_total Total successful executions',
      '# TYPE saga_successful_executions_total counter',
      '# HELP saga_failed_executions_total Total failed executions',
      '# TYPE saga_failed_executions_total counter',
      '# HELP saga_avg_execution_time_ms Average execution time in ms',
      '# TYPE saga_avg_execution_time_ms gauge',
      '# HELP saga_active_operations Current active operations',
      '# TYPE saga_active_operations gauge',
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
