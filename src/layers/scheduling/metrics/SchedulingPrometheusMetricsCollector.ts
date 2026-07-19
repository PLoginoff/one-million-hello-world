import { SchedulingMetricsCollector } from '../statistics/SchedulingMetricsCollector';

export interface SchedulingPrometheusMetrics {
  scheduling_executions_total: number;
  scheduling_successful_executions_total: number;
  scheduling_failed_executions_total: number;
  scheduling_avg_execution_time_ms: number;
  scheduling_active_operations: number;
  collectedAt: number;
}

export interface SchedulingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SchedulingPrometheusMetricsCollector {
  private readonly _collector: SchedulingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SchedulingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SchedulingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      scheduling_executions_total: m.executionCount,
      scheduling_successful_executions_total: m.successCount,
      scheduling_failed_executions_total: m.failureCount,
      scheduling_avg_execution_time_ms: m.averageExecutionTime,
      scheduling_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SchedulingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'scheduling_executions_total', value: m.scheduling_executions_total, labels: {}, timestamp: ts },
      {
        name: 'scheduling_successful_executions_total',
        value: m.scheduling_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'scheduling_failed_executions_total',
        value: m.scheduling_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'scheduling_avg_execution_time_ms',
        value: m.scheduling_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'scheduling_active_operations', value: m.scheduling_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP scheduling_executions_total Total executions',
      '# TYPE scheduling_executions_total counter',
      '# HELP scheduling_successful_executions_total Total successful executions',
      '# TYPE scheduling_successful_executions_total counter',
      '# HELP scheduling_failed_executions_total Total failed executions',
      '# TYPE scheduling_failed_executions_total counter',
      '# HELP scheduling_avg_execution_time_ms Average execution time in ms',
      '# TYPE scheduling_avg_execution_time_ms gauge',
      '# HELP scheduling_active_operations Current active operations',
      '# TYPE scheduling_active_operations gauge',
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
