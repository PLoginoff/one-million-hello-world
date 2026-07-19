import { PropertyTestingMetricsCollector } from '../statistics/PropertyTestingMetricsCollector';

export interface PropertyTestingPrometheusMetrics {
  property_testing_executions_total: number;
  property_testing_successful_executions_total: number;
  property_testing_failed_executions_total: number;
  property_testing_avg_execution_time_ms: number;
  property_testing_active_operations: number;
  collectedAt: number;
}

export interface PropertyTestingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class PropertyTestingPrometheusMetricsCollector {
  private readonly _collector: PropertyTestingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: PropertyTestingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): PropertyTestingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      property_testing_executions_total: m.executionCount,
      property_testing_successful_executions_total: m.successCount,
      property_testing_failed_executions_total: m.failureCount,
      property_testing_avg_execution_time_ms: m.averageExecutionTime,
      property_testing_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): PropertyTestingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'property_testing_executions_total',
        value: m.property_testing_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'property_testing_successful_executions_total',
        value: m.property_testing_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'property_testing_failed_executions_total',
        value: m.property_testing_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'property_testing_avg_execution_time_ms',
        value: m.property_testing_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'property_testing_active_operations',
        value: m.property_testing_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP property_testing_executions_total Total executions',
      '# TYPE property_testing_executions_total counter',
      '# HELP property_testing_successful_executions_total Total successful executions',
      '# TYPE property_testing_successful_executions_total counter',
      '# HELP property_testing_failed_executions_total Total failed executions',
      '# TYPE property_testing_failed_executions_total counter',
      '# HELP property_testing_avg_execution_time_ms Average execution time in ms',
      '# TYPE property_testing_avg_execution_time_ms gauge',
      '# HELP property_testing_active_operations Current active operations',
      '# TYPE property_testing_active_operations gauge',
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
