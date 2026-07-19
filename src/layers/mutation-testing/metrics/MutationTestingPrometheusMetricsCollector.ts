import { MutationTestingMetricsCollector } from '../statistics/MutationTestingMetricsCollector';

export interface MutationTestingPrometheusMetrics {
  mutation_testing_executions_total: number;
  mutation_testing_successful_executions_total: number;
  mutation_testing_failed_executions_total: number;
  mutation_testing_avg_execution_time_ms: number;
  mutation_testing_active_operations: number;
  collectedAt: number;
}

export interface MutationTestingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MutationTestingPrometheusMetricsCollector {
  private readonly _collector: MutationTestingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: MutationTestingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): MutationTestingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      mutation_testing_executions_total: m.executionCount,
      mutation_testing_successful_executions_total: m.successCount,
      mutation_testing_failed_executions_total: m.failureCount,
      mutation_testing_avg_execution_time_ms: m.averageExecutionTime,
      mutation_testing_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): MutationTestingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'mutation_testing_executions_total',
        value: m.mutation_testing_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'mutation_testing_successful_executions_total',
        value: m.mutation_testing_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'mutation_testing_failed_executions_total',
        value: m.mutation_testing_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'mutation_testing_avg_execution_time_ms',
        value: m.mutation_testing_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'mutation_testing_active_operations',
        value: m.mutation_testing_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP mutation_testing_executions_total Total executions',
      '# TYPE mutation_testing_executions_total counter',
      '# HELP mutation_testing_successful_executions_total Total successful executions',
      '# TYPE mutation_testing_successful_executions_total counter',
      '# HELP mutation_testing_failed_executions_total Total failed executions',
      '# TYPE mutation_testing_failed_executions_total counter',
      '# HELP mutation_testing_avg_execution_time_ms Average execution time in ms',
      '# TYPE mutation_testing_avg_execution_time_ms gauge',
      '# HELP mutation_testing_active_operations Current active operations',
      '# TYPE mutation_testing_active_operations gauge',
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
