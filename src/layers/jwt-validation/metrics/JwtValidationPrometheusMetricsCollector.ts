import { JwtValidationMetricsCollector } from '../statistics/JwtValidationMetricsCollector';

export interface JwtValidationPrometheusMetrics {
  jwt_validation_executions_total: number;
  jwt_validation_successful_executions_total: number;
  jwt_validation_failed_executions_total: number;
  jwt_validation_avg_execution_time_ms: number;
  jwt_validation_active_operations: number;
  collectedAt: number;
}

export interface JwtValidationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class JwtValidationPrometheusMetricsCollector {
  private readonly _collector: JwtValidationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: JwtValidationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): JwtValidationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      jwt_validation_executions_total: m.executionCount,
      jwt_validation_successful_executions_total: m.successCount,
      jwt_validation_failed_executions_total: m.failureCount,
      jwt_validation_avg_execution_time_ms: m.averageExecutionTime,
      jwt_validation_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): JwtValidationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'jwt_validation_executions_total', value: m.jwt_validation_executions_total, labels: {}, timestamp: ts },
      {
        name: 'jwt_validation_successful_executions_total',
        value: m.jwt_validation_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'jwt_validation_failed_executions_total',
        value: m.jwt_validation_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'jwt_validation_avg_execution_time_ms',
        value: m.jwt_validation_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'jwt_validation_active_operations',
        value: m.jwt_validation_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP jwt_validation_executions_total Total executions',
      '# TYPE jwt_validation_executions_total counter',
      '# HELP jwt_validation_successful_executions_total Total successful executions',
      '# TYPE jwt_validation_successful_executions_total counter',
      '# HELP jwt_validation_failed_executions_total Total failed executions',
      '# TYPE jwt_validation_failed_executions_total counter',
      '# HELP jwt_validation_avg_execution_time_ms Average execution time in ms',
      '# TYPE jwt_validation_avg_execution_time_ms gauge',
      '# HELP jwt_validation_active_operations Current active operations',
      '# TYPE jwt_validation_active_operations gauge',
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
