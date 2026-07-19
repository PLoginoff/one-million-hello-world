import { SchemaRegistryMetricsCollector } from '../statistics/SchemaRegistryMetricsCollector';

export interface SchemaRegistryPrometheusMetrics {
  schema_registry_executions_total: number;
  schema_registry_successful_executions_total: number;
  schema_registry_failed_executions_total: number;
  schema_registry_avg_execution_time_ms: number;
  schema_registry_active_operations: number;
  collectedAt: number;
}

export interface SchemaRegistryMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SchemaRegistryPrometheusMetricsCollector {
  private readonly _collector: SchemaRegistryMetricsCollector;
  private _collectionCount: number;

  constructor(collector: SchemaRegistryMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): SchemaRegistryPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      schema_registry_executions_total: m.executionCount,
      schema_registry_successful_executions_total: m.successCount,
      schema_registry_failed_executions_total: m.failureCount,
      schema_registry_avg_execution_time_ms: m.averageExecutionTime,
      schema_registry_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SchemaRegistryMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'schema_registry_executions_total',
        value: m.schema_registry_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'schema_registry_successful_executions_total',
        value: m.schema_registry_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'schema_registry_failed_executions_total',
        value: m.schema_registry_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'schema_registry_avg_execution_time_ms',
        value: m.schema_registry_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'schema_registry_active_operations',
        value: m.schema_registry_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP schema_registry_executions_total Total executions',
      '# TYPE schema_registry_executions_total counter',
      '# HELP schema_registry_successful_executions_total Total successful executions',
      '# TYPE schema_registry_successful_executions_total counter',
      '# HELP schema_registry_failed_executions_total Total failed executions',
      '# TYPE schema_registry_failed_executions_total counter',
      '# HELP schema_registry_avg_execution_time_ms Average execution time in ms',
      '# TYPE schema_registry_avg_execution_time_ms gauge',
      '# HELP schema_registry_active_operations Current active operations',
      '# TYPE schema_registry_active_operations gauge',
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
