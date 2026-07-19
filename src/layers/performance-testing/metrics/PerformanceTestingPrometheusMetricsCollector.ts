import { PerformanceTestingMetricsCollector } from '../statistics/PerformanceTestingMetricsCollector';

export interface PerformanceTestingPrometheusMetrics {
  performance_testing_executions_total: number;
  performance_testing_successful_executions_total: number;
  performance_testing_failed_executions_total: number;
  performance_testing_avg_execution_time_ms: number;
  performance_testing_active_operations: number;
  collectedAt: number;
}

export interface PerformanceTestingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class PerformanceTestingPrometheusMetricsCollector {
  private readonly _collector: PerformanceTestingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: PerformanceTestingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): PerformanceTestingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      performance_testing_executions_total: m.executionCount,
      performance_testing_successful_executions_total: m.successCount,
      performance_testing_failed_executions_total: m.failureCount,
      performance_testing_avg_execution_time_ms: m.averageExecutionTime,
      performance_testing_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): PerformanceTestingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'performance_testing_executions_total',
        value: m.performance_testing_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'performance_testing_successful_executions_total',
        value: m.performance_testing_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'performance_testing_failed_executions_total',
        value: m.performance_testing_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'performance_testing_avg_execution_time_ms',
        value: m.performance_testing_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'performance_testing_active_operations',
        value: m.performance_testing_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP performance_testing_executions_total Total executions',
      '# TYPE performance_testing_executions_total counter',
      '# HELP performance_testing_successful_executions_total Total successful executions',
      '# TYPE performance_testing_successful_executions_total counter',
      '# HELP performance_testing_failed_executions_total Total failed executions',
      '# TYPE performance_testing_failed_executions_total counter',
      '# HELP performance_testing_avg_execution_time_ms Average execution time in ms',
      '# TYPE performance_testing_avg_execution_time_ms gauge',
      '# HELP performance_testing_active_operations Current active operations',
      '# TYPE performance_testing_active_operations gauge',
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
