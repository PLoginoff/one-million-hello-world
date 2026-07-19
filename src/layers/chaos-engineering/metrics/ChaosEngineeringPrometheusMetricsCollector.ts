import { ChaosEngineeringMetricsCollector } from '../statistics/ChaosEngineeringMetricsCollector';

export interface ChaosEngineeringPrometheusMetrics {
  chaos_engineering_executions_total: number;
  chaos_engineering_successful_executions_total: number;
  chaos_engineering_failed_executions_total: number;
  chaos_engineering_avg_execution_time_ms: number;
  chaos_engineering_active_operations: number;
  collectedAt: number;
}

export interface ChaosEngineeringMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ChaosEngineeringPrometheusMetricsCollector {
  private readonly _collector: ChaosEngineeringMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ChaosEngineeringMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ChaosEngineeringPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      chaos_engineering_executions_total: m.executionCount,
      chaos_engineering_successful_executions_total: m.successCount,
      chaos_engineering_failed_executions_total: m.failureCount,
      chaos_engineering_avg_execution_time_ms: m.averageExecutionTime,
      chaos_engineering_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ChaosEngineeringMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'chaos_engineering_executions_total',
        value: m.chaos_engineering_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'chaos_engineering_successful_executions_total',
        value: m.chaos_engineering_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'chaos_engineering_failed_executions_total',
        value: m.chaos_engineering_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'chaos_engineering_avg_execution_time_ms',
        value: m.chaos_engineering_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'chaos_engineering_active_operations',
        value: m.chaos_engineering_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP chaos_engineering_executions_total Total executions',
      '# TYPE chaos_engineering_executions_total counter',
      '# HELP chaos_engineering_successful_executions_total Total successful executions',
      '# TYPE chaos_engineering_successful_executions_total counter',
      '# HELP chaos_engineering_failed_executions_total Total failed executions',
      '# TYPE chaos_engineering_failed_executions_total counter',
      '# HELP chaos_engineering_avg_execution_time_ms Average execution time in ms',
      '# TYPE chaos_engineering_avg_execution_time_ms gauge',
      '# HELP chaos_engineering_active_operations Current active operations',
      '# TYPE chaos_engineering_active_operations gauge',
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
