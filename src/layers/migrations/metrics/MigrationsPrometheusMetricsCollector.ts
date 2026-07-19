import { MigrationsMetricsCollector } from '../statistics/MigrationsMetricsCollector';

export interface MigrationsPrometheusMetrics {
  migrations_executions_total: number;
  migrations_successful_executions_total: number;
  migrations_failed_executions_total: number;
  migrations_avg_execution_time_ms: number;
  migrations_active_operations: number;
  collectedAt: number;
}

export interface MigrationsMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MigrationsPrometheusMetricsCollector {
  private readonly _collector: MigrationsMetricsCollector;
  private _collectionCount: number;

  constructor(collector: MigrationsMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): MigrationsPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      migrations_executions_total: m.executionCount,
      migrations_successful_executions_total: m.successCount,
      migrations_failed_executions_total: m.failureCount,
      migrations_avg_execution_time_ms: m.averageExecutionTime,
      migrations_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): MigrationsMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'migrations_executions_total', value: m.migrations_executions_total, labels: {}, timestamp: ts },
      {
        name: 'migrations_successful_executions_total',
        value: m.migrations_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'migrations_failed_executions_total',
        value: m.migrations_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'migrations_avg_execution_time_ms',
        value: m.migrations_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'migrations_active_operations', value: m.migrations_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP migrations_executions_total Total executions',
      '# TYPE migrations_executions_total counter',
      '# HELP migrations_successful_executions_total Total successful executions',
      '# TYPE migrations_successful_executions_total counter',
      '# HELP migrations_failed_executions_total Total failed executions',
      '# TYPE migrations_failed_executions_total counter',
      '# HELP migrations_avg_execution_time_ms Average execution time in ms',
      '# TYPE migrations_avg_execution_time_ms gauge',
      '# HELP migrations_active_operations Current active operations',
      '# TYPE migrations_active_operations gauge',
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
