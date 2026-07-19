import { BlueGreenDeployMetricsCollector } from '../statistics/BlueGreenDeployMetricsCollector';

export interface BlueGreenDeployPrometheusMetrics {
  blue_green_deploy_executions_total: number;
  blue_green_deploy_successful_executions_total: number;
  blue_green_deploy_failed_executions_total: number;
  blue_green_deploy_avg_execution_time_ms: number;
  blue_green_deploy_active_operations: number;
  collectedAt: number;
}

export interface BlueGreenDeployMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class BlueGreenDeployPrometheusMetricsCollector {
  private readonly _collector: BlueGreenDeployMetricsCollector;
  private _collectionCount: number;

  constructor(collector: BlueGreenDeployMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): BlueGreenDeployPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      blue_green_deploy_executions_total: m.executionCount,
      blue_green_deploy_successful_executions_total: m.successCount,
      blue_green_deploy_failed_executions_total: m.failureCount,
      blue_green_deploy_avg_execution_time_ms: m.averageExecutionTime,
      blue_green_deploy_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): BlueGreenDeployMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'blue_green_deploy_executions_total',
        value: m.blue_green_deploy_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'blue_green_deploy_successful_executions_total',
        value: m.blue_green_deploy_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'blue_green_deploy_failed_executions_total',
        value: m.blue_green_deploy_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'blue_green_deploy_avg_execution_time_ms',
        value: m.blue_green_deploy_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'blue_green_deploy_active_operations',
        value: m.blue_green_deploy_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP blue_green_deploy_executions_total Total executions',
      '# TYPE blue_green_deploy_executions_total counter',
      '# HELP blue_green_deploy_successful_executions_total Total successful executions',
      '# TYPE blue_green_deploy_successful_executions_total counter',
      '# HELP blue_green_deploy_failed_executions_total Total failed executions',
      '# TYPE blue_green_deploy_failed_executions_total counter',
      '# HELP blue_green_deploy_avg_execution_time_ms Average execution time in ms',
      '# TYPE blue_green_deploy_avg_execution_time_ms gauge',
      '# HELP blue_green_deploy_active_operations Current active operations',
      '# TYPE blue_green_deploy_active_operations gauge',
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
