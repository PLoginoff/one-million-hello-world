import { GitopsMetricsCollector } from '../statistics/GitopsMetricsCollector';

export interface GitopsPrometheusMetrics {
  gitops_executions_total: number;
  gitops_successful_executions_total: number;
  gitops_failed_executions_total: number;
  gitops_avg_execution_time_ms: number;
  gitops_active_operations: number;
  collectedAt: number;
}

export interface GitopsMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class GitopsPrometheusMetricsCollector {
  private readonly _collector: GitopsMetricsCollector;
  private _collectionCount: number;

  constructor(collector: GitopsMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): GitopsPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      gitops_executions_total: m.executionCount,
      gitops_successful_executions_total: m.successCount,
      gitops_failed_executions_total: m.failureCount,
      gitops_avg_execution_time_ms: m.averageExecutionTime,
      gitops_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): GitopsMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'gitops_executions_total', value: m.gitops_executions_total, labels: {}, timestamp: ts },
      {
        name: 'gitops_successful_executions_total',
        value: m.gitops_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'gitops_failed_executions_total', value: m.gitops_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'gitops_avg_execution_time_ms', value: m.gitops_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'gitops_active_operations', value: m.gitops_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP gitops_executions_total Total executions',
      '# TYPE gitops_executions_total counter',
      '# HELP gitops_successful_executions_total Total successful executions',
      '# TYPE gitops_successful_executions_total counter',
      '# HELP gitops_failed_executions_total Total failed executions',
      '# TYPE gitops_failed_executions_total counter',
      '# HELP gitops_avg_execution_time_ms Average execution time in ms',
      '# TYPE gitops_avg_execution_time_ms gauge',
      '# HELP gitops_active_operations Current active operations',
      '# TYPE gitops_active_operations gauge',
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
