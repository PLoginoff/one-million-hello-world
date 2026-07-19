import { LoadBalancerMetricsCollector } from '../statistics/LoadBalancerMetricsCollector';

export interface LoadBalancerPrometheusMetrics {
  load_balancer_executions_total: number;
  load_balancer_successful_executions_total: number;
  load_balancer_failed_executions_total: number;
  load_balancer_avg_execution_time_ms: number;
  load_balancer_active_operations: number;
  collectedAt: number;
}

export interface LoadBalancerMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class LoadBalancerPrometheusMetricsCollector {
  private readonly _collector: LoadBalancerMetricsCollector;
  private _collectionCount: number;

  constructor(collector: LoadBalancerMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): LoadBalancerPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      load_balancer_executions_total: m.executionCount,
      load_balancer_successful_executions_total: m.successCount,
      load_balancer_failed_executions_total: m.failureCount,
      load_balancer_avg_execution_time_ms: m.averageExecutionTime,
      load_balancer_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): LoadBalancerMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'load_balancer_executions_total', value: m.load_balancer_executions_total, labels: {}, timestamp: ts },
      {
        name: 'load_balancer_successful_executions_total',
        value: m.load_balancer_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'load_balancer_failed_executions_total',
        value: m.load_balancer_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'load_balancer_avg_execution_time_ms',
        value: m.load_balancer_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'load_balancer_active_operations', value: m.load_balancer_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP load_balancer_executions_total Total executions',
      '# TYPE load_balancer_executions_total counter',
      '# HELP load_balancer_successful_executions_total Total successful executions',
      '# TYPE load_balancer_successful_executions_total counter',
      '# HELP load_balancer_failed_executions_total Total failed executions',
      '# TYPE load_balancer_failed_executions_total counter',
      '# HELP load_balancer_avg_execution_time_ms Average execution time in ms',
      '# TYPE load_balancer_avg_execution_time_ms gauge',
      '# HELP load_balancer_active_operations Current active operations',
      '# TYPE load_balancer_active_operations gauge',
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
