import { CostOptimizationMetricsCollector } from '../statistics/CostOptimizationMetricsCollector';

export interface CostOptimizationPrometheusMetrics {
  cost_optimization_executions_total: number;
  cost_optimization_successful_executions_total: number;
  cost_optimization_failed_executions_total: number;
  cost_optimization_avg_execution_time_ms: number;
  cost_optimization_active_operations: number;
  collectedAt: number;
}

export interface CostOptimizationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class CostOptimizationPrometheusMetricsCollector {
  private readonly _collector: CostOptimizationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: CostOptimizationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): CostOptimizationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      cost_optimization_executions_total: m.executionCount,
      cost_optimization_successful_executions_total: m.successCount,
      cost_optimization_failed_executions_total: m.failureCount,
      cost_optimization_avg_execution_time_ms: m.averageExecutionTime,
      cost_optimization_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): CostOptimizationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'cost_optimization_executions_total',
        value: m.cost_optimization_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'cost_optimization_successful_executions_total',
        value: m.cost_optimization_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'cost_optimization_failed_executions_total',
        value: m.cost_optimization_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'cost_optimization_avg_execution_time_ms',
        value: m.cost_optimization_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'cost_optimization_active_operations',
        value: m.cost_optimization_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP cost_optimization_executions_total Total executions',
      '# TYPE cost_optimization_executions_total counter',
      '# HELP cost_optimization_successful_executions_total Total successful executions',
      '# TYPE cost_optimization_successful_executions_total counter',
      '# HELP cost_optimization_failed_executions_total Total failed executions',
      '# TYPE cost_optimization_failed_executions_total counter',
      '# HELP cost_optimization_avg_execution_time_ms Average execution time in ms',
      '# TYPE cost_optimization_avg_execution_time_ms gauge',
      '# HELP cost_optimization_active_operations Current active operations',
      '# TYPE cost_optimization_active_operations gauge',
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
