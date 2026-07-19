import { MultiTenancyMetricsCollector } from '../statistics/MultiTenancyMetricsCollector';

export interface MultiTenancyPrometheusMetrics {
  multi_tenancy_executions_total: number;
  multi_tenancy_successful_executions_total: number;
  multi_tenancy_failed_executions_total: number;
  multi_tenancy_avg_execution_time_ms: number;
  multi_tenancy_active_operations: number;
  collectedAt: number;
}

export interface MultiTenancyMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MultiTenancyPrometheusMetricsCollector {
  private readonly _collector: MultiTenancyMetricsCollector;
  private _collectionCount: number;

  constructor(collector: MultiTenancyMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): MultiTenancyPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      multi_tenancy_executions_total: m.executionCount,
      multi_tenancy_successful_executions_total: m.successCount,
      multi_tenancy_failed_executions_total: m.failureCount,
      multi_tenancy_avg_execution_time_ms: m.averageExecutionTime,
      multi_tenancy_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): MultiTenancyMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'multi_tenancy_executions_total', value: m.multi_tenancy_executions_total, labels: {}, timestamp: ts },
      {
        name: 'multi_tenancy_successful_executions_total',
        value: m.multi_tenancy_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'multi_tenancy_failed_executions_total',
        value: m.multi_tenancy_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'multi_tenancy_avg_execution_time_ms',
        value: m.multi_tenancy_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'multi_tenancy_active_operations', value: m.multi_tenancy_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP multi_tenancy_executions_total Total executions',
      '# TYPE multi_tenancy_executions_total counter',
      '# HELP multi_tenancy_successful_executions_total Total successful executions',
      '# TYPE multi_tenancy_successful_executions_total counter',
      '# HELP multi_tenancy_failed_executions_total Total failed executions',
      '# TYPE multi_tenancy_failed_executions_total counter',
      '# HELP multi_tenancy_avg_execution_time_ms Average execution time in ms',
      '# TYPE multi_tenancy_avg_execution_time_ms gauge',
      '# HELP multi_tenancy_active_operations Current active operations',
      '# TYPE multi_tenancy_active_operations gauge',
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
