import { ContractTestingMetricsCollector } from '../statistics/ContractTestingMetricsCollector';

export interface ContractTestingPrometheusMetrics {
  contract_testing_executions_total: number;
  contract_testing_successful_executions_total: number;
  contract_testing_failed_executions_total: number;
  contract_testing_avg_execution_time_ms: number;
  contract_testing_active_operations: number;
  collectedAt: number;
}

export interface ContractTestingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ContractTestingPrometheusMetricsCollector {
  private readonly _collector: ContractTestingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ContractTestingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ContractTestingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      contract_testing_executions_total: m.executionCount,
      contract_testing_successful_executions_total: m.successCount,
      contract_testing_failed_executions_total: m.failureCount,
      contract_testing_avg_execution_time_ms: m.averageExecutionTime,
      contract_testing_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ContractTestingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'contract_testing_executions_total',
        value: m.contract_testing_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'contract_testing_successful_executions_total',
        value: m.contract_testing_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'contract_testing_failed_executions_total',
        value: m.contract_testing_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'contract_testing_avg_execution_time_ms',
        value: m.contract_testing_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'contract_testing_active_operations',
        value: m.contract_testing_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP contract_testing_executions_total Total executions',
      '# TYPE contract_testing_executions_total counter',
      '# HELP contract_testing_successful_executions_total Total successful executions',
      '# TYPE contract_testing_successful_executions_total counter',
      '# HELP contract_testing_failed_executions_total Total failed executions',
      '# TYPE contract_testing_failed_executions_total counter',
      '# HELP contract_testing_avg_execution_time_ms Average execution time in ms',
      '# TYPE contract_testing_avg_execution_time_ms gauge',
      '# HELP contract_testing_active_operations Current active operations',
      '# TYPE contract_testing_active_operations gauge',
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
