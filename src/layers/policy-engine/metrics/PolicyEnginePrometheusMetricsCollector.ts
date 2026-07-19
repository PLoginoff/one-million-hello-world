import { PolicyEngineMetricsCollector } from '../statistics/PolicyEngineMetricsCollector';

export interface PolicyEnginePrometheusMetrics {
  policy_engine_executions_total: number;
  policy_engine_successful_executions_total: number;
  policy_engine_failed_executions_total: number;
  policy_engine_avg_execution_time_ms: number;
  policy_engine_active_operations: number;
  collectedAt: number;
}

export interface PolicyEngineMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class PolicyEnginePrometheusMetricsCollector {
  private readonly _collector: PolicyEngineMetricsCollector;
  private _collectionCount: number;

  constructor(collector: PolicyEngineMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): PolicyEnginePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      policy_engine_executions_total: m.executionCount,
      policy_engine_successful_executions_total: m.successCount,
      policy_engine_failed_executions_total: m.failureCount,
      policy_engine_avg_execution_time_ms: m.averageExecutionTime,
      policy_engine_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): PolicyEngineMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'policy_engine_executions_total', value: m.policy_engine_executions_total, labels: {}, timestamp: ts },
      {
        name: 'policy_engine_successful_executions_total',
        value: m.policy_engine_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'policy_engine_failed_executions_total',
        value: m.policy_engine_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'policy_engine_avg_execution_time_ms',
        value: m.policy_engine_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'policy_engine_active_operations', value: m.policy_engine_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP policy_engine_executions_total Total executions',
      '# TYPE policy_engine_executions_total counter',
      '# HELP policy_engine_successful_executions_total Total successful executions',
      '# TYPE policy_engine_successful_executions_total counter',
      '# HELP policy_engine_failed_executions_total Total failed executions',
      '# TYPE policy_engine_failed_executions_total counter',
      '# HELP policy_engine_avg_execution_time_ms Average execution time in ms',
      '# TYPE policy_engine_avg_execution_time_ms gauge',
      '# HELP policy_engine_active_operations Current active operations',
      '# TYPE policy_engine_active_operations gauge',
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
