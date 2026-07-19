import { SecretsRotationMetricsCollector } from '../statistics/SecretsRotationMetricsCollector';

export interface SecretsRotationPrometheusMetrics {
  secrets_rotation_executions_total: number;
  secrets_rotation_successful_executions_total: number;
  secrets_rotation_failed_executions_total: number;
  secrets_rotation_avg_execution_time_ms: number;
  secrets_rotation_active_operations: number;
  collectedAt: number;
}

export interface SecretsRotationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SecretsRotationPrometheusMetricsCollector {
  private readonly _collector: SecretsRotationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SecretsRotationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SecretsRotationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      secrets_rotation_executions_total: m.executionCount,
      secrets_rotation_successful_executions_total: m.successCount,
      secrets_rotation_failed_executions_total: m.failureCount,
      secrets_rotation_avg_execution_time_ms: m.averageExecutionTime,
      secrets_rotation_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SecretsRotationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'secrets_rotation_executions_total',
        value: m.secrets_rotation_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'secrets_rotation_successful_executions_total',
        value: m.secrets_rotation_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'secrets_rotation_failed_executions_total',
        value: m.secrets_rotation_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'secrets_rotation_avg_execution_time_ms',
        value: m.secrets_rotation_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'secrets_rotation_active_operations',
        value: m.secrets_rotation_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP secrets_rotation_executions_total Total executions',
      '# TYPE secrets_rotation_executions_total counter',
      '# HELP secrets_rotation_successful_executions_total Total successful executions',
      '# TYPE secrets_rotation_successful_executions_total counter',
      '# HELP secrets_rotation_failed_executions_total Total failed executions',
      '# TYPE secrets_rotation_failed_executions_total counter',
      '# HELP secrets_rotation_avg_execution_time_ms Average execution time in ms',
      '# TYPE secrets_rotation_avg_execution_time_ms gauge',
      '# HELP secrets_rotation_active_operations Current active operations',
      '# TYPE secrets_rotation_active_operations gauge',
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
