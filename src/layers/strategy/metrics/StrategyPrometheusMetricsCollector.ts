import { StrategyMetricsCollector } from '../statistics/StrategyMetricsCollector';

export interface StrategyPrometheusMetrics {
  strategy_executions_total: number;
  strategy_successful_executions_total: number;
  strategy_failed_executions_total: number;
  strategy_avg_execution_time_ms: number;
  strategy_active_operations: number;
  collectedAt: number;
}

export interface StrategyMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class StrategyPrometheusMetricsCollector {
  private readonly _collector: StrategyMetricsCollector;
  private _collectionCount: number;

  constructor(collector: StrategyMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): StrategyPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      strategy_executions_total: m.executionCount,
      strategy_successful_executions_total: m.successCount,
      strategy_failed_executions_total: m.failureCount,
      strategy_avg_execution_time_ms: m.averageExecutionTime,
      strategy_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): StrategyMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'strategy_executions_total', value: m.strategy_executions_total, labels: {}, timestamp: ts },
      {
        name: 'strategy_successful_executions_total',
        value: m.strategy_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'strategy_failed_executions_total',
        value: m.strategy_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      { name: 'strategy_avg_execution_time_ms', value: m.strategy_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'strategy_active_operations', value: m.strategy_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP strategy_executions_total Total executions',
      '# TYPE strategy_executions_total counter',
      '# HELP strategy_successful_executions_total Total successful executions',
      '# TYPE strategy_successful_executions_total counter',
      '# HELP strategy_failed_executions_total Total failed executions',
      '# TYPE strategy_failed_executions_total counter',
      '# HELP strategy_avg_execution_time_ms Average execution time in ms',
      '# TYPE strategy_avg_execution_time_ms gauge',
      '# HELP strategy_active_operations Current active operations',
      '# TYPE strategy_active_operations gauge',
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
