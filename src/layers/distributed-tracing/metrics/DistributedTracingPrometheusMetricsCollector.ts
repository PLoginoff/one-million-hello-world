import { DistributedTracingMetricsCollector } from '../statistics/DistributedTracingMetricsCollector';

export interface DistributedTracingPrometheusMetrics {
  distributed_tracing_executions_total: number;
  distributed_tracing_successful_executions_total: number;
  distributed_tracing_failed_executions_total: number;
  distributed_tracing_avg_execution_time_ms: number;
  distributed_tracing_active_operations: number;
  collectedAt: number;
}

export interface DistributedTracingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class DistributedTracingPrometheusMetricsCollector {
  private readonly _collector: DistributedTracingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: DistributedTracingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): DistributedTracingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      distributed_tracing_executions_total: m.executionCount,
      distributed_tracing_successful_executions_total: m.successCount,
      distributed_tracing_failed_executions_total: m.failureCount,
      distributed_tracing_avg_execution_time_ms: m.averageExecutionTime,
      distributed_tracing_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): DistributedTracingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'distributed_tracing_executions_total',
        value: m.distributed_tracing_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'distributed_tracing_successful_executions_total',
        value: m.distributed_tracing_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'distributed_tracing_failed_executions_total',
        value: m.distributed_tracing_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'distributed_tracing_avg_execution_time_ms',
        value: m.distributed_tracing_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'distributed_tracing_active_operations',
        value: m.distributed_tracing_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP distributed_tracing_executions_total Total executions',
      '# TYPE distributed_tracing_executions_total counter',
      '# HELP distributed_tracing_successful_executions_total Total successful executions',
      '# TYPE distributed_tracing_successful_executions_total counter',
      '# HELP distributed_tracing_failed_executions_total Total failed executions',
      '# TYPE distributed_tracing_failed_executions_total counter',
      '# HELP distributed_tracing_avg_execution_time_ms Average execution time in ms',
      '# TYPE distributed_tracing_avg_execution_time_ms gauge',
      '# HELP distributed_tracing_active_operations Current active operations',
      '# TYPE distributed_tracing_active_operations gauge',
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
