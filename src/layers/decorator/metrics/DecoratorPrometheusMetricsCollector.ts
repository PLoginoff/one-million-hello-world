import { DecoratorMetricsCollector } from '../statistics/DecoratorMetricsCollector';

export interface DecoratorPrometheusMetrics {
  decorator_executions_total: number;
  decorator_successful_executions_total: number;
  decorator_failed_executions_total: number;
  decorator_avg_execution_time_ms: number;
  decorator_active_operations: number;
  collectedAt: number;
}

export interface DecoratorMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class DecoratorPrometheusMetricsCollector {
  private readonly _collector: DecoratorMetricsCollector;
  private _collectionCount: number;

  constructor(collector: DecoratorMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): DecoratorPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      decorator_executions_total: m.executionCount,
      decorator_successful_executions_total: m.successCount,
      decorator_failed_executions_total: m.failureCount,
      decorator_avg_execution_time_ms: m.averageExecutionTime,
      decorator_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): DecoratorMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'decorator_executions_total', value: m.decorator_executions_total, labels: {}, timestamp: ts },
      {
        name: 'decorator_successful_executions_total',
        value: m.decorator_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'decorator_failed_executions_total',
        value: m.decorator_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'decorator_avg_execution_time_ms', value: m.decorator_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'decorator_active_operations', value: m.decorator_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP decorator_executions_total Total executions',
      '# TYPE decorator_executions_total counter',
      '# HELP decorator_successful_executions_total Total successful executions',
      '# TYPE decorator_successful_executions_total counter',
      '# HELP decorator_failed_executions_total Total failed executions',
      '# TYPE decorator_failed_executions_total counter',
      '# HELP decorator_avg_execution_time_ms Average execution time in ms',
      '# TYPE decorator_avg_execution_time_ms gauge',
      '# HELP decorator_active_operations Current active operations',
      '# TYPE decorator_active_operations gauge',
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
