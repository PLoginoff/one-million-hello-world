import { UnitOfWorkMetricsCollector } from '../statistics/UnitOfWorkMetricsCollector';

export interface UnitOfWorkPrometheusMetrics {
  unit_of_work_executions_total: number;
  unit_of_work_successful_executions_total: number;
  unit_of_work_failed_executions_total: number;
  unit_of_work_avg_execution_time_ms: number;
  unit_of_work_active_operations: number;
  collectedAt: number;
}

export interface UnitOfWorkMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class UnitOfWorkPrometheusMetricsCollector {
  private readonly _collector: UnitOfWorkMetricsCollector;
  private _collectionCount: number;

  constructor(collector: UnitOfWorkMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): UnitOfWorkPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      unit_of_work_executions_total: m.executionCount,
      unit_of_work_successful_executions_total: m.successCount,
      unit_of_work_failed_executions_total: m.failureCount,
      unit_of_work_avg_execution_time_ms: m.averageExecutionTime,
      unit_of_work_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): UnitOfWorkMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'unit_of_work_executions_total', value: m.unit_of_work_executions_total, labels: {}, timestamp: ts },
      {
        name: 'unit_of_work_successful_executions_total',
        value: m.unit_of_work_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'unit_of_work_failed_executions_total',
        value: m.unit_of_work_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'unit_of_work_avg_execution_time_ms',
        value: m.unit_of_work_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'unit_of_work_active_operations', value: m.unit_of_work_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP unit_of_work_executions_total Total executions',
      '# TYPE unit_of_work_executions_total counter',
      '# HELP unit_of_work_successful_executions_total Total successful executions',
      '# TYPE unit_of_work_successful_executions_total counter',
      '# HELP unit_of_work_failed_executions_total Total failed executions',
      '# TYPE unit_of_work_failed_executions_total counter',
      '# HELP unit_of_work_avg_execution_time_ms Average execution time in ms',
      '# TYPE unit_of_work_avg_execution_time_ms gauge',
      '# HELP unit_of_work_active_operations Current active operations',
      '# TYPE unit_of_work_active_operations gauge',
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
