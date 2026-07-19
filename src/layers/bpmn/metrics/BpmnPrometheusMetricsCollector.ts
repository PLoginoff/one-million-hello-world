import { BpmnMetricsCollector } from '../statistics/BpmnMetricsCollector';

export interface BpmnPrometheusMetrics {
  bpmn_executions_total: number;
  bpmn_successful_executions_total: number;
  bpmn_failed_executions_total: number;
  bpmn_avg_execution_time_ms: number;
  bpmn_active_operations: number;
  collectedAt: number;
}

export interface BpmnMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class BpmnPrometheusMetricsCollector {
  private readonly _collector: BpmnMetricsCollector;
  private _collectionCount: number;

  constructor(collector: BpmnMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): BpmnPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      bpmn_executions_total: m.executionCount,
      bpmn_successful_executions_total: m.successCount,
      bpmn_failed_executions_total: m.failureCount,
      bpmn_avg_execution_time_ms: m.averageExecutionTime,
      bpmn_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): BpmnMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'bpmn_executions_total', value: m.bpmn_executions_total, labels: {}, timestamp: ts },
      {
        name: 'bpmn_successful_executions_total',
        value: m.bpmn_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'bpmn_failed_executions_total', value: m.bpmn_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'bpmn_avg_execution_time_ms', value: m.bpmn_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'bpmn_active_operations', value: m.bpmn_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP bpmn_executions_total Total executions',
      '# TYPE bpmn_executions_total counter',
      '# HELP bpmn_successful_executions_total Total successful executions',
      '# TYPE bpmn_successful_executions_total counter',
      '# HELP bpmn_failed_executions_total Total failed executions',
      '# TYPE bpmn_failed_executions_total counter',
      '# HELP bpmn_avg_execution_time_ms Average execution time in ms',
      '# TYPE bpmn_avg_execution_time_ms gauge',
      '# HELP bpmn_active_operations Current active operations',
      '# TYPE bpmn_active_operations gauge',
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
