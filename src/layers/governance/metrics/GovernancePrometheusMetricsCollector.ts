import { GovernanceMetricsCollector } from '../statistics/GovernanceMetricsCollector';

export interface GovernancePrometheusMetrics {
  governance_executions_total: number;
  governance_successful_executions_total: number;
  governance_failed_executions_total: number;
  governance_avg_execution_time_ms: number;
  governance_active_operations: number;
  collectedAt: number;
}

export interface GovernanceMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class GovernancePrometheusMetricsCollector {
  private readonly _collector: GovernanceMetricsCollector;
  private _collectionCount: number;

  constructor(collector: GovernanceMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): GovernancePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      governance_executions_total: m.executionCount,
      governance_successful_executions_total: m.successCount,
      governance_failed_executions_total: m.failureCount,
      governance_avg_execution_time_ms: m.averageExecutionTime,
      governance_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): GovernanceMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'governance_executions_total', value: m.governance_executions_total, labels: {}, timestamp: ts },
      {
        name: 'governance_successful_executions_total',
        value: m.governance_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'governance_failed_executions_total',
        value: m.governance_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'governance_avg_execution_time_ms',
        value: m.governance_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'governance_active_operations', value: m.governance_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP governance_executions_total Total executions',
      '# TYPE governance_executions_total counter',
      '# HELP governance_successful_executions_total Total successful executions',
      '# TYPE governance_successful_executions_total counter',
      '# HELP governance_failed_executions_total Total failed executions',
      '# TYPE governance_failed_executions_total counter',
      '# HELP governance_avg_execution_time_ms Average execution time in ms',
      '# TYPE governance_avg_execution_time_ms gauge',
      '# HELP governance_active_operations Current active operations',
      '# TYPE governance_active_operations gauge',
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
