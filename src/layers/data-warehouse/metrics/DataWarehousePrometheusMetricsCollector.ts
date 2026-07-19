import { DataWarehouseMetricsCollector } from '../statistics/DataWarehouseMetricsCollector';

export interface DataWarehousePrometheusMetrics {
  data_warehouse_executions_total: number;
  data_warehouse_successful_executions_total: number;
  data_warehouse_failed_executions_total: number;
  data_warehouse_avg_execution_time_ms: number;
  data_warehouse_active_operations: number;
  collectedAt: number;
}

export interface DataWarehouseMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class DataWarehousePrometheusMetricsCollector {
  private readonly _collector: DataWarehouseMetricsCollector;
  private _collectionCount: number;

  constructor(collector: DataWarehouseMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): DataWarehousePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      data_warehouse_executions_total: m.executionCount,
      data_warehouse_successful_executions_total: m.successCount,
      data_warehouse_failed_executions_total: m.failureCount,
      data_warehouse_avg_execution_time_ms: m.averageExecutionTime,
      data_warehouse_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): DataWarehouseMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'data_warehouse_executions_total', value: m.data_warehouse_executions_total, labels: {}, timestamp: ts },
      {
        name: 'data_warehouse_successful_executions_total',
        value: m.data_warehouse_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'data_warehouse_failed_executions_total',
        value: m.data_warehouse_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'data_warehouse_avg_execution_time_ms',
        value: m.data_warehouse_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'data_warehouse_active_operations',
        value: m.data_warehouse_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP data_warehouse_executions_total Total executions',
      '# TYPE data_warehouse_executions_total counter',
      '# HELP data_warehouse_successful_executions_total Total successful executions',
      '# TYPE data_warehouse_successful_executions_total counter',
      '# HELP data_warehouse_failed_executions_total Total failed executions',
      '# TYPE data_warehouse_failed_executions_total counter',
      '# HELP data_warehouse_avg_execution_time_ms Average execution time in ms',
      '# TYPE data_warehouse_avg_execution_time_ms gauge',
      '# HELP data_warehouse_active_operations Current active operations',
      '# TYPE data_warehouse_active_operations gauge',
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
