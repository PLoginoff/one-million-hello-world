import { ReportingMetricsCollector } from '../statistics/ReportingMetricsCollector';

export interface ReportingPrometheusMetrics {
  reporting_executions_total: number;
  reporting_successful_executions_total: number;
  reporting_failed_executions_total: number;
  reporting_avg_execution_time_ms: number;
  reporting_active_operations: number;
  collectedAt: number;
}

export interface ReportingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ReportingPrometheusMetricsCollector {
  private readonly _collector: ReportingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ReportingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ReportingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      reporting_executions_total: m.executionCount,
      reporting_successful_executions_total: m.successCount,
      reporting_failed_executions_total: m.failureCount,
      reporting_avg_execution_time_ms: m.averageExecutionTime,
      reporting_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ReportingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'reporting_executions_total', value: m.reporting_executions_total, labels: {}, timestamp: ts },
      {
        name: 'reporting_successful_executions_total',
        value: m.reporting_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'reporting_failed_executions_total',
        value: m.reporting_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'reporting_avg_execution_time_ms', value: m.reporting_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'reporting_active_operations', value: m.reporting_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP reporting_executions_total Total executions',
      '# TYPE reporting_executions_total counter',
      '# HELP reporting_successful_executions_total Total successful executions',
      '# TYPE reporting_successful_executions_total counter',
      '# HELP reporting_failed_executions_total Total failed executions',
      '# TYPE reporting_failed_executions_total counter',
      '# HELP reporting_avg_execution_time_ms Average execution time in ms',
      '# TYPE reporting_avg_execution_time_ms gauge',
      '# HELP reporting_active_operations Current active operations',
      '# TYPE reporting_active_operations gauge',
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
