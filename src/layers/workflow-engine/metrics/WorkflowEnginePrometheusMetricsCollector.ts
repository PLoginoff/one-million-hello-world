import { WorkflowEngineMetricsCollector } from '../statistics/WorkflowEngineMetricsCollector';

export interface WorkflowEnginePrometheusMetrics {
  workflow_engine_executions_total: number;
  workflow_engine_successful_executions_total: number;
  workflow_engine_failed_executions_total: number;
  workflow_engine_avg_execution_time_ms: number;
  workflow_engine_active_operations: number;
  collectedAt: number;
}

export interface WorkflowEngineMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class WorkflowEnginePrometheusMetricsCollector {
  private readonly _collector: WorkflowEngineMetricsCollector;
  private _collectionCount: number;

  constructor(collector: WorkflowEngineMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): WorkflowEnginePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      workflow_engine_executions_total: m.executionCount,
      workflow_engine_successful_executions_total: m.successCount,
      workflow_engine_failed_executions_total: m.failureCount,
      workflow_engine_avg_execution_time_ms: m.averageExecutionTime,
      workflow_engine_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): WorkflowEngineMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'workflow_engine_executions_total',
        value: m.workflow_engine_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'workflow_engine_successful_executions_total',
        value: m.workflow_engine_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'workflow_engine_failed_executions_total',
        value: m.workflow_engine_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'workflow_engine_avg_execution_time_ms',
        value: m.workflow_engine_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'workflow_engine_active_operations',
        value: m.workflow_engine_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP workflow_engine_executions_total Total executions',
      '# TYPE workflow_engine_executions_total counter',
      '# HELP workflow_engine_successful_executions_total Total successful executions',
      '# TYPE workflow_engine_successful_executions_total counter',
      '# HELP workflow_engine_failed_executions_total Total failed executions',
      '# TYPE workflow_engine_failed_executions_total counter',
      '# HELP workflow_engine_avg_execution_time_ms Average execution time in ms',
      '# TYPE workflow_engine_avg_execution_time_ms gauge',
      '# HELP workflow_engine_active_operations Current active operations',
      '# TYPE workflow_engine_active_operations gauge',
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
