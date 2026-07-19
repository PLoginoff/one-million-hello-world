import { AuthorizationMetricsCollector } from '../statistics/AuthorizationMetricsCollector';

export interface AuthorizationPrometheusMetrics {
  authorization_executions_total: number;
  authorization_successful_executions_total: number;
  authorization_failed_executions_total: number;
  authorization_avg_execution_time_ms: number;
  authorization_active_operations: number;
  collectedAt: number;
}

export interface AuthorizationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class AuthorizationPrometheusMetricsCollector {
  private readonly _collector: AuthorizationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: AuthorizationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): AuthorizationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      authorization_executions_total: m.executionCount,
      authorization_successful_executions_total: m.successCount,
      authorization_failed_executions_total: m.failureCount,
      authorization_avg_execution_time_ms: m.averageExecutionTime,
      authorization_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): AuthorizationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'authorization_executions_total', value: m.authorization_executions_total, labels: {}, timestamp: ts },
      {
        name: 'authorization_successful_executions_total',
        value: m.authorization_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'authorization_failed_executions_total',
        value: m.authorization_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'authorization_avg_execution_time_ms',
        value: m.authorization_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'authorization_active_operations', value: m.authorization_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP authorization_executions_total Total executions',
      '# TYPE authorization_executions_total counter',
      '# HELP authorization_successful_executions_total Total successful executions',
      '# TYPE authorization_successful_executions_total counter',
      '# HELP authorization_failed_executions_total Total failed executions',
      '# TYPE authorization_failed_executions_total counter',
      '# HELP authorization_avg_execution_time_ms Average execution time in ms',
      '# TYPE authorization_avg_execution_time_ms gauge',
      '# HELP authorization_active_operations Current active operations',
      '# TYPE authorization_active_operations gauge',
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
