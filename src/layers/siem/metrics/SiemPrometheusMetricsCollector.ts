import { SiemMetricsCollector } from '../statistics/SiemMetricsCollector';

export interface SiemPrometheusMetrics {
  siem_executions_total: number;
  siem_successful_executions_total: number;
  siem_failed_executions_total: number;
  siem_avg_execution_time_ms: number;
  siem_active_operations: number;
  collectedAt: number;
}

export interface SiemMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SiemPrometheusMetricsCollector {
  private readonly _collector: SiemMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SiemMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SiemPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      siem_executions_total: m.executionCount,
      siem_successful_executions_total: m.successCount,
      siem_failed_executions_total: m.failureCount,
      siem_avg_execution_time_ms: m.averageExecutionTime,
      siem_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SiemMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'siem_executions_total', value: m.siem_executions_total, labels: {}, timestamp: ts },
      {
        name: 'siem_successful_executions_total',
        value: m.siem_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'siem_failed_executions_total', value: m.siem_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'siem_avg_execution_time_ms', value: m.siem_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'siem_active_operations', value: m.siem_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP siem_executions_total Total executions',
      '# TYPE siem_executions_total counter',
      '# HELP siem_successful_executions_total Total successful executions',
      '# TYPE siem_successful_executions_total counter',
      '# HELP siem_failed_executions_total Total failed executions',
      '# TYPE siem_failed_executions_total counter',
      '# HELP siem_avg_execution_time_ms Average execution time in ms',
      '# TYPE siem_avg_execution_time_ms gauge',
      '# HELP siem_active_operations Current active operations',
      '# TYPE siem_active_operations gauge',
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
