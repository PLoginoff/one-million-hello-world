import { CanaryDeployMetricsCollector } from '../statistics/CanaryDeployMetricsCollector';

export interface CanaryDeployPrometheusMetrics {
  canary_deploy_executions_total: number;
  canary_deploy_successful_executions_total: number;
  canary_deploy_failed_executions_total: number;
  canary_deploy_avg_execution_time_ms: number;
  canary_deploy_active_operations: number;
  collectedAt: number;
}

export interface CanaryDeployMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class CanaryDeployPrometheusMetricsCollector {
  private readonly _collector: CanaryDeployMetricsCollector;
  private _collectionCount: number;

  constructor(collector: CanaryDeployMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): CanaryDeployPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      canary_deploy_executions_total: m.executionCount,
      canary_deploy_successful_executions_total: m.successCount,
      canary_deploy_failed_executions_total: m.failureCount,
      canary_deploy_avg_execution_time_ms: m.averageExecutionTime,
      canary_deploy_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): CanaryDeployMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'canary_deploy_executions_total', value: m.canary_deploy_executions_total, labels: {}, timestamp: ts },
      {
        name: 'canary_deploy_successful_executions_total',
        value: m.canary_deploy_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'canary_deploy_failed_executions_total',
        value: m.canary_deploy_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'canary_deploy_avg_execution_time_ms',
        value: m.canary_deploy_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'canary_deploy_active_operations', value: m.canary_deploy_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP canary_deploy_executions_total Total executions',
      '# TYPE canary_deploy_executions_total counter',
      '# HELP canary_deploy_successful_executions_total Total successful executions',
      '# TYPE canary_deploy_successful_executions_total counter',
      '# HELP canary_deploy_failed_executions_total Total failed executions',
      '# TYPE canary_deploy_failed_executions_total counter',
      '# HELP canary_deploy_avg_execution_time_ms Average execution time in ms',
      '# TYPE canary_deploy_avg_execution_time_ms gauge',
      '# HELP canary_deploy_active_operations Current active operations',
      '# TYPE canary_deploy_active_operations gauge',
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
