import { CqrsMetricsCollector } from '../statistics/CqrsMetricsCollector';

export interface CqrsPrometheusMetrics {
  cqrs_executions_total: number;
  cqrs_successful_executions_total: number;
  cqrs_failed_executions_total: number;
  cqrs_avg_execution_time_ms: number;
  cqrs_active_operations: number;
  collectedAt: number;
}

export interface CqrsMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class CqrsPrometheusMetricsCollector {
  private readonly _collector: CqrsMetricsCollector;
  private _collectionCount: number;

  constructor(collector: CqrsMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): CqrsPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      cqrs_executions_total: m.executionCount,
      cqrs_successful_executions_total: m.successCount,
      cqrs_failed_executions_total: m.failureCount,
      cqrs_avg_execution_time_ms: m.averageExecutionTime,
      cqrs_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): CqrsMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'cqrs_executions_total', value: m.cqrs_executions_total, labels: {}, timestamp: ts },
      {
        name: 'cqrs_successful_executions_total',
        value: m.cqrs_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'cqrs_failed_executions_total', value: m.cqrs_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'cqrs_avg_execution_time_ms', value: m.cqrs_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'cqrs_active_operations', value: m.cqrs_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP cqrs_executions_total Total executions',
      '# TYPE cqrs_executions_total counter',
      '# HELP cqrs_successful_executions_total Total successful executions',
      '# TYPE cqrs_successful_executions_total counter',
      '# HELP cqrs_failed_executions_total Total failed executions',
      '# TYPE cqrs_failed_executions_total counter',
      '# HELP cqrs_avg_execution_time_ms Average execution time in ms',
      '# TYPE cqrs_avg_execution_time_ms gauge',
      '# HELP cqrs_active_operations Current active operations',
      '# TYPE cqrs_active_operations gauge',
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
