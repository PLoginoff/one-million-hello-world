import { SpecificationMetricsCollector } from '../statistics/SpecificationMetricsCollector';

export interface SpecificationPrometheusMetrics {
  specification_executions_total: number;
  specification_successful_executions_total: number;
  specification_failed_executions_total: number;
  specification_avg_execution_time_ms: number;
  specification_active_operations: number;
  collectedAt: number;
}

export interface SpecificationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SpecificationPrometheusMetricsCollector {
  private readonly _collector: SpecificationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SpecificationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SpecificationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      specification_executions_total: m.executionCount,
      specification_successful_executions_total: m.successCount,
      specification_failed_executions_total: m.failureCount,
      specification_avg_execution_time_ms: m.averageExecutionTime,
      specification_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SpecificationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'specification_executions_total', value: m.specification_executions_total, labels: {}, timestamp: ts },
      {
        name: 'specification_successful_executions_total',
        value: m.specification_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'specification_failed_executions_total',
        value: m.specification_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'specification_avg_execution_time_ms',
        value: m.specification_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'specification_active_operations', value: m.specification_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP specification_executions_total Total executions',
      '# TYPE specification_executions_total counter',
      '# HELP specification_successful_executions_total Total successful executions',
      '# TYPE specification_successful_executions_total counter',
      '# HELP specification_failed_executions_total Total failed executions',
      '# TYPE specification_failed_executions_total counter',
      '# HELP specification_avg_execution_time_ms Average execution time in ms',
      '# TYPE specification_avg_execution_time_ms gauge',
      '# HELP specification_active_operations Current active operations',
      '# TYPE specification_active_operations gauge',
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
